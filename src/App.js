// src/App.js
import React, { useState, useEffect } from "react";
import "./App.css";
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import Tesseract from "tesseract.js";
import constants from "./constants";
import Login from "./components/Login";
import Register from "./components/Register";
import { Routes, Route, useNavigate, Navigate, Link } from 'react-router-dom';
import Cookies from 'js-cookie';
import axios from 'axios';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;

// Robust parser for various quiz formats
function parseQuizOutput(quizText, numOptions = 4, questionType) {
    const questionBlocks = quizText
        .split(/\*\*Question\s*\d+\*\*|Question\s*\d*[:.]?/i)
        .map(q => q.trim())
        .filter(q => q.length > 0);

    const questions = [];
    questionBlocks.forEach((block) => {
        let lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        const questionLine = lines.find(l => !l.toLowerCase().startsWith('options:') && !l.toLowerCase().startsWith('answer:'));
        const question = questionLine ? questionLine : '';
        const optionsStart = lines.findIndex(l => l.toLowerCase().startsWith('options:'));
        const answerLine = lines.find(l => l.toLowerCase().startsWith('answer:'));
        let answer = '';
        if (answerLine) {
            const match = answerLine.match(/Answer:\s*(.*)/i);
            if (match) {
                answer = match[1].trim();
            }
        }
        let options = [];
        if (optionsStart !== -1) {
            for (let i = optionsStart + 1; i < lines.length; i++) {
                if (lines[i].toLowerCase().startsWith('answer:')) break;
                options.push(lines[i].replace(/^[A-Z][).]\s*/, '').trim());
            }
        }

        if (questionType === "truefalse") {
            if (question && options.length === 2 && answer && (options.some(opt => opt.toLowerCase() === 'true') && options.some(opt => opt.toLowerCase() === 'false'))) {
                questions.push({ question, options, answer, isEditing: false });
            }
        } else if (questionType === "mcq") {
            if (question && options.length === numOptions && answer) {
                questions.push({ question, options, answer, isEditing: false });
            }
        } else {
            if (question && answer) {
                questions.push({ question, answer, isEditing: false });
            }
        }
    });
    return questions;
}

const EXPORT_CONTENT_OPTIONS = [
    { value: "both", label: "Questions & Answers" },
    { value: "questions", label: "Questions Only" },
    { value: "answers", label: "Answers Only" }
];

const QUESTION_TYPE_OPTIONS = [
    { value: "mcq", label: "MCQ" },
    { value: "mcq_multiple", label: "MCQ (Multiple Correct Answers)" },
    { value: "truefalse", label: "True/False" },
    { value: "fillblanks", label: "Fill in the blanks" },
    { value: "faq", label: "FAQ" },
    { value: "short", label: "Short Answer" },
    { value: "higherorder", label: "Higher Order QA" },
];

const SERVER_URL = constants.SERVER_URL;

const PrivateRoute = ({ children }) => {
    const token = Cookies.get('jwtToken');
    return token ? children : <Navigate to="/login" />;
};

function App() {
    const [quizText, setQuizText] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exportFormat, setExportFormat] = useState("excel");
    const [exportContent, setExportContent] = useState("both");
    const [numQuestions, setNumQuestions] = useState(10);
    const [difficulty, setDifficulty] = useState("medium");
    const [numOptions, setNumOptions] = useState(4);
    const [questionType, setQuestionType] = useState("mcq");
    const [theme, setTheme] = useState("light");
    const [isAuthenticated, setIsAuthenticated] = useState(!!Cookies.get('jwtToken'));
    const navigate = useNavigate();

    // Update auth state when token changes
    useEffect(() => {
        const token = Cookies.get('jwtToken');
        setIsAuthenticated(!!token);
    }, [navigate]);

    useEffect(() => {
        document.body.className = theme;
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === "light" ? "dark" : "light"));
    };

    const getFilteredQuestions = () => {
        if (exportContent === "questions") {
            return questions.map(({ question, options }) => ({ question, options }));
        }
        if (exportContent === "answers") {
            return questions.map(({ question, answer }) => ({ question, answer }));
        }
        return questions;
    };

    const handleUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        setError("");
        setSuccess("Extracting text...");
        setLoading(true);
        const reader = new FileReader();

        if (file.type === "application/pdf") {
            reader.onload = async (e) => {
                try {
                    const typedArray = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
                    let text = "";
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        text += content.items.map(item => item.str).join(' ') + '\n';
                    }
                    setQuizText(text);
                    setSuccess("PDF text extracted successfully!");
                } catch (err) {
                    setError("Failed to extract text from PDF.");
                } finally {
                    setLoading(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } else if (file.type.startsWith("image/")) {
            try {
                const { data: { text } } = await Tesseract.recognize(file, 'eng');
                setQuizText(text);
                setSuccess("Image text extracted successfully!");
            } catch (err) {
                setError("Failed to extract text from image.");
            } finally {
                setLoading(false);
            }
        } else if (file.type === "text/plain" || file.type === "application/json") {
            reader.onload = (e) => {
                setQuizText(e.target.result);
                setSuccess("File content loaded!");
                setLoading(false);
            };
            reader.readAsText(file);
        } else {
            setError("Unsupported file type.");
            setLoading(false);
        }
    };

    const handleQuizGenerate = async () => {
        if (!quizText.trim()) {
            setError("Please provide some text to generate a quiz from.");
            return;
        }
        setLoading(true);
        setError("");
        setSuccess("");
        setQuestions([]);
        const token = Cookies.get('jwtToken');

        try {
            const res = await axios.post(
                `${SERVER_URL}/generate-quiz`,
                {
                    text: quizText,
                    num_questions: numQuestions,
                    difficulty: difficulty,
                    num_options: numOptions,
                    question_type: questionType,
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            if (res.data.quiz) {
                const parsedQuestions = parseQuizOutput(res.data.quiz, numOptions, questionType);
                setQuestions(parsedQuestions);
                setSuccess("Quiz generated successfully!");
            } else {
                setError(res.data.detail || "No quiz generated from the text.");
            }
        } catch (err) {
            setError(err.response?.data?.detail || "An error occurred while generating the quiz.");
        } finally {
            setLoading(false);
        }
    };

    const handleEditQuestion = (index) => {
        setQuestions(prev =>
            prev.map((q, i) => (i === index ? { ...q, isEditing: !q.isEditing } : q))
        );
    };

    const handleQuestionChange = (index, field, value) => {
        setQuestions(prev =>
            prev.map((q, i) => {
                if (i === index) {
                    if (field.startsWith('option-')) {
                        const optionIndex = parseInt(field.split('-')[1], 10);
                        const newOptions = [...q.options];
                        newOptions[optionIndex] = value;
                        return { ...q, options: newOptions };
                    }
                    return { ...q, [field]: value };
                }
                return q;
            })
        );
    };

    const handleSaveEdits = () => {
        setQuestions(prev => prev.map(q => ({ ...q, isEditing: false })));
        setSuccess("Edits have been saved locally.");
        setTimeout(() => setSuccess(""), 2000);
    };

    const downloadFile = (url, filename) => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExport = () => {
        const filtered = getFilteredQuestions();
        if (!filtered.length) return;

        switch (exportFormat) {
            case "excel": handleExportExcel(filtered); break;
            case "pdf": handleExportPDF(filtered); break;
            case "json": handleExportJSON(filtered); break;
            case "txt": handleExportTXT(filtered); break;
            default: break;
        }
    };

    const handleExportExcel = (data) => {
        const worksheetData = data.map((q, idx) => {
            const row = { 'No.': idx + 1, 'Question': q.question };
            if (q.options) {
                q.options.forEach((opt, i) => {
                    row[`Option ${String.fromCharCode(65 + i)}`] = opt;
                });
            }
            if (q.answer) row['Answer'] = q.answer;
            return row;
        });
        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Quiz");
        XLSX.writeFile(workbook, "quiz.xlsx");
    };

    const handleExportPDF = (data) => {
        const doc = new jsPDF();
        let y = 15;
        doc.setFontSize(14);
        doc.text("Generated Quiz", 105, y, { align: 'center' });
        y += 10;
        doc.setFontSize(11);

        data.forEach((q, idx) => {
            if (y > 280) { doc.addPage(); y = 15; }
            const questionText = `${idx + 1}. ${q.question}`;
            const splitQuestion = doc.splitTextToSize(questionText, 180);
            doc.text(splitQuestion, 10, y);
            y += (splitQuestion.length * 6);

            if (q.options) {
                q.options.forEach((opt, i) => {
                    if (y > 280) { doc.addPage(); y = 15; }
                    doc.text(`${String.fromCharCode(65 + i)}. ${opt}`, 15, y);
                    y += 7;
                });
            }

            if (q.answer) {
                if (y > 280) { doc.addPage(); y = 15; }
                doc.setFont(undefined, 'italic');
                doc.text(`Answer: ${q.answer}`, 15, y);
                doc.setFont(undefined, 'normal');
                y += 10;
            }
        });
        doc.save("quiz.pdf");
    };

    const handleExportJSON = (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        downloadFile(URL.createObjectURL(blob), "quiz.json");
    };

    const handleExportTXT = (data) => {
        let txt = "";
        data.forEach((q, idx) => {
            txt += `${idx + 1}. ${q.question}\n`;
            if (q.options) {
                q.options.forEach((opt, i) => {
                    txt += `  ${String.fromCharCode(65 + i)}. ${opt}\n`;
                });
            }
            if (q.answer) txt += `  Answer: ${q.answer}\n`;
            txt += "\n";
        });
        const blob = new Blob([txt], { type: "text/plain" });
        downloadFile(URL.createObjectURL(blob), "quiz.txt");
    };

    const handleCopyJSON = () => {
        const filtered = getFilteredQuestions();
        if (!filtered.length) return;
        navigator.clipboard.writeText(JSON.stringify(filtered, null, 2))
            .then(() => setSuccess("Quiz copied as JSON!"))
            .catch(() => setError("Failed to copy."))
            .finally(() => setTimeout(() => setSuccess(""), 2000));
    };

    const handleCopyTXT = () => {
        let txt = "";
        getFilteredQuestions().forEach((q, idx) => {
            txt += `${idx + 1}. ${q.question}\n`;
            if (q.options) {
                q.options.forEach((opt, i) => {
                    txt += `  ${String.fromCharCode(65 + i)}. ${opt}\n`;
                });
            }
            if (q.answer) txt += `  Answer: ${q.answer}\n`;
            txt += "\n";
        });
        navigator.clipboard.writeText(txt)
            .then(() => setSuccess("Quiz copied as TXT!"))
            .catch(() => setError("Failed to copy."))
            .finally(() => setTimeout(() => setSuccess(""), 2000));
    };

    const handleLogout = () => {
        Cookies.remove('jwtToken');
        setIsAuthenticated(false);
        navigate('/login');
    };

    return (
        <div className={`app-grid ${theme}`}>
            <nav>
                <ul>
                    <li><Link to="/">Home</Link></li>
                    {isAuthenticated ? (
                        <li><button onClick={handleLogout}>Logout</button></li>
                    ) : (
                        <li><Link to="/login">Login</Link></li>
                    )}
                </ul>
            </nav>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route
                    path="/"
                    element={
                        <PrivateRoute>
                            <div className="main-content">
                                <div className="left-panel">
                                <div className="quiz-header">
                                    <h2>Create Quiz</h2>
                                    <button
                                        className={`theme-toggle-button ${theme}`}
                                        onClick={toggleTheme}
                                    >
                                        {theme === "light" ? "🌞" : "🌙"}
                                    </button>
                                </div>

                                <div className="form-row">
                                    <label>Number of Questions:</label>
                                    <select
                                        value={numQuestions}
                                        onChange={e => setNumQuestions(Number(e.target.value))}
                                        className="dropdown-select"
                                    >
                                        {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                                            <option key={num} value={num}>{num}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-row">
                                    <label>Difficulty:</label>
                                    <select
                                        value={difficulty}
                                        onChange={e => setDifficulty(e.target.value)}
                                        className="dropdown-select"
                                    >
                                        <option value="easy">Easy</option>
                                        <option value="medium">Medium</option>
                                        <option value="hard">Hard</option>
                                    </select>
                                </div>

                                <input
                                    type="file"
                                    accept=".pdf,.txt,.json,image/*"
                                    onChange={handleUpload}
                                    className="upload-input"
                                />
                                <div className="or-text">OR</div>
                                <textarea
                                    value={quizText}
                                    onChange={(e) => setQuizText(e.target.value)}
                                    placeholder="Paste your text here..."
                                    className="text-input"
                                ></textarea>

                                <div className="form-row">
                                    <label>Question Type:</label>
                                    <select
                                        value={questionType}
                                        onChange={(e) => setQuestionType(e.target.value)}
                                    >
                                        {QUESTION_TYPE_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-row">
                                    <label>Number of Options:</label>
                                    <input
                                        type="number"
                                        min="2"
                                        max="6"
                                        value={numOptions}
                                        onChange={(e) => setNumOptions(parseInt(e.target.value, 10))}
                                        disabled={questionType !== 'mcq'}
                                    />
                                </div>

                                <button
                                    onClick={handleQuizGenerate}
                                    disabled={loading || !quizText}
                                    className="generate-button"
                                >
                                    {loading ? 'Generating...' : 'Generate Quiz'}
                                </button>

                                {error && <div className="error">{error}</div>}
                                {success && <div className="success">{success}</div>}
                            </div>
                            <div className="right-panel">
                                {loading && (
                                    <div className="loading-overlay">
                                        <div className="spinner"></div>
                                    </div>
                                )}

                                <div className="quiz-header">
                                    <h2>Generated Quiz</h2>
                                    {questions.length > 0 && (
                                        <div className="export-row">
                                            <select
                                                value={exportFormat}
                                                onChange={(e) => setExportFormat(e.target.value)}
                                                className="export-select"
                                            >
                                                <option value="excel">Excel</option>
                                                <option value="pdf">PDF</option>
                                                <option value="json">JSON</option>
                                                <option value="txt">TXT</option>
                                            </select>
                                            <button
                                                onClick={handleExport}
                                                disabled={!questions.length}
                                                className="export-button"
                                            >
                                                Export
                                            </button>
                                            <button
                                                onClick={handleCopyJSON}
                                                disabled={!questions.length}
                                                className="export-button"
                                            >
                                                Copy JSON
                                            </button>
                                            <button
                                                onClick={handleCopyTXT}
                                                disabled={!questions.length}
                                                className="export-button"
                                            >
                                                Copy TXT
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {!questions.length && !loading && (
                                    <div className="no-quiz">No quiz generated yet.</div>
                                )}

                                {questions.length > 0 && (
                                    <div className="quiz-list">
                                        <div className="toggle-row">
                                            <label className="toggle-label">
                                                <input
                                                    type="checkbox"
                                                    checked={exportContent === 'both' || exportContent === 'answers'}
                                                    onChange={() => setExportContent(prev => prev === 'questions' ? 'both' : 'questions')}
                                                />
                                                Show Answers
                                            </label>
                                        </div>
                                        {getFilteredQuestions().map((q, index) => (
                                            <div key={index} className="quiz-card">
                                                <div className="quiz-content">
                                                    {q.isEditing ? (
                                                        <div>
                                                            <textarea
                                                                className="edit-input"
                                                                value={q.question}
                                                                onChange={(e) => handleQuestionChange(index, 'question', e.target.value)}
                                                            />
                                                            {q.options && (
                                                                <ul className="quiz-options">
                                                                    {q.options.map((opt, i) => (
                                                                        <li key={i}>
                                                                            <input
                                                                                type="text"
                                                                                className="edit-input option-input"
                                                                                value={opt}
                                                                                onChange={(e) => handleQuestionChange(index, `option-${i}`, e.target.value)}
                                                                            />
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                            {q.answer && (
                                                                <div className="quiz-answer">
                                                                    <strong>Answer:</strong>
                                                                    <input
                                                                        type="text"
                                                                        className="edit-input answer-input"
                                                                        value={q.answer}
                                                                        onChange={(e) => handleQuestionChange(index, 'answer', e.target.value)}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <div className="quiz-question">{q.question}</div>
                                                            {q.options && (
                                                                <ul className="quiz-options">
                                                                    {q.options.map((opt, i) => (
                                                                        <li key={i}>
                                                                            <span className="option-label">
                                                                                {String.fromCharCode(65 + i)}.
                                                                            </span>{' '}
                                                                            {opt}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                            {q.answer && (exportContent === "both" || exportContent === "answers") && (
                                                                <div className="quiz-answer">
                                                                    <strong>Answer:</strong> {q.answer}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="button-group">
                                                    <button className="edit-button" onClick={() => handleEditQuestion(index)}>
                                                        {q.isEditing ? "View" : "Edit"}
                                                    </button>
                                                    {q.isEditing && (
                                                        <button className="save-button" onClick={handleSaveEdits}>
                                                            Save
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                    </div>
                </PrivateRoute>
            } />
        </Routes>
    </div>
);
}

export default App;