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
import { FiSun, FiMoon, FiMenu, FiLogOut, FiGrid, FiClock, FiSettings, FiChevronRight, FiChevronLeft, FiLogIn } from 'react-icons/fi';

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

// const EXPORT_CONTENT_OPTIONS = [
//     { value: "both", label: "Questions & Answers" },
//     { value: "questions", label: "Questions Only" },
//     { value: "answers", label: "Answers Only" }
// ];

const QUESTION_TYPE_OPTIONS = [
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'truefalse', label: 'True/False' },
    { value: 'short', label: 'Short Answer' }
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
    const [theme, setTheme] = useState(() => {
        // Get theme from localStorage or use system preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) return savedTheme;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });
    // const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(!!Cookies.get('jwtToken'));
    const [activeMenuTile, setActiveMenuTile] = useState('dashboard'); // 'dashboard', 'history', 'settings'
    const [isMenuCollapsed, setIsMenuCollapsed] = useState(false);
    const navigate = useNavigate();

    // Update theme class on html element and save to localStorage
    useEffect(() => {
        const root = document.documentElement;
        root.className = theme;
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Update auth state when token changes
    useEffect(() => {
        const token = Cookies.get('jwtToken');
        setIsAuthenticated(!!token);
    }, [navigate]);

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === "light" ? "dark" : "light"));
    };

    const handleLogout = () => {
        Cookies.remove('jwtToken');
        setIsAuthenticated(false);
        navigate('/login');
        // setIsMenuOpen(false);
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

    // const handleCopyJSON = () => {
    //     const filtered = getFilteredQuestions();
    //     if (!filtered.length) return;
    //     navigator.clipboard.writeText(JSON.stringify(filtered, null, 2))
    //         .then(() => setSuccess("Quiz copied as JSON!"))
    //         .catch(() => setError("Failed to copy."))
    //         .finally(() => setTimeout(() => setSuccess(""), 2000));
    // };

    // const handleCopyTXT = () => {
    //     let txt = "";
    //     getFilteredQuestions().forEach((q, idx) => {
    //         txt += `${idx + 1}. ${q.question}\n`;
    //         if (q.options) {
    //             q.options.forEach((opt, i) => {
    //                 txt += `  ${String.fromCharCode(65 + i)}. ${opt}\n`;
    //             });
    //         }
    //         if (q.answer) txt += `  Answer: ${q.answer}\n`;
    //         txt += "\n";
    //     });
    //     navigator.clipboard.writeText(txt)
    //         .then(() => setSuccess("Quiz copied as TXT!"))
    //         .catch(() => setError("Failed to copy."))
    //         .finally(() => setTimeout(() => setSuccess(""), 2000));
    // };

    const toggleMenuCollapse = () => {
        setIsMenuCollapsed(!isMenuCollapsed);
    };

    return (
        <div className={`app-container ${theme}`}>
            {/* Sidebar Navigation */}
            <aside className={`sidebar ${isMenuCollapsed ? 'collapsed' : ''}`}>
                <div className="sidebar-header">
                    {!isMenuCollapsed && <h3>QuizOQ</h3>}
                    <button 
                        className="menu-toggle" 
                        onClick={toggleMenuCollapse}
                        aria-label={isMenuCollapsed ? 'Expand menu' : 'Collapse menu'}
                    >
                        {isMenuCollapsed ? <FiChevronRight /> : <FiChevronLeft />}
                    </button>
                </div>
                
                <nav className="menu-tiles">
                    <button 
                        className={`menu-tile ${activeMenuTile === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setActiveMenuTile('dashboard')}
                        title="Dashboard"
                    >
                        <FiGrid className="tile-icon" />
                        {!isMenuCollapsed && <span>Dashboard</span>}
                    </button>
                    
                    <button 
                        className={`menu-tile ${activeMenuTile === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveMenuTile('history')}
                        title="History"
                    >
                        <FiClock className="tile-icon" />
                        {!isMenuCollapsed && <span>History</span>}
                    </button>
                    
                    <button 
                        className={`menu-tile ${activeMenuTile === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveMenuTile('settings')}
                        title="Settings"
                    >
                        <FiSettings className="tile-icon" />
                        {!isMenuCollapsed && <span>Settings</span>}
                    </button>
                </nav>

                <div className="sidebar-footer">
                    {isAuthenticated ? (
                        <button 
                            className="menu-tile logout-button"
                            onClick={handleLogout}
                            title="Logout"
                        >
                            <FiLogOut className="tile-icon" />
                            {!isMenuCollapsed && <span>Logout</span>}
                        </button>
                    ) : (
                        <Link 
                            to="/login" 
                            className="menu-tile"
                            title="Login"
                        >
                            <FiLogIn className="tile-icon" />
                            {!isMenuCollapsed && <span>Login</span>}
                        </Link>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <div className="main-content">
                {/* Header */}
                <header className="app-header">
                    <button 
                        className="menu-toggle" 
                        onClick={toggleMenuCollapse}
                        aria-label={isMenuCollapsed ? 'Expand menu' : 'Collapse menu'}
                    >
                        <FiMenu />
                    </button>
                    <h1 className="app-title">QuizOQ</h1>
                    <div className="header-actions">
                        <button 
                            className="theme-toggle" 
                            onClick={toggleTheme}
                            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                        >
                            {theme === 'light' ? <FiMoon /> : <FiSun />}
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <main className="page-content">
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route
                            path="/"
                            element={
                                <PrivateRoute>
                                    <div className="dashboard-container">
                                        {/* Side by side layout */}
                                        <div className="content-wrapper">
                                            {/* Input Section */}
                                            <section className="input-section">
                                                <div className="section-header">
                                                    <h2>Input</h2>
                                                </div>
                                                <div className="section-content">
                                                    <div className="form-group">
                                                        <input
                                                            type="file"
                                                            accept=".pdf,.txt,.json,image/*"
                                                            onChange={handleUpload}
                                                            className="form-control"
                                                        />
                                                    </div>

                                                    <div className="text-center my-4">
                                                        <span className="text-muted">OR</span>
                                                    </div>

                                                    <div className="form-group">
                                                        <textarea
                                                            value={quizText}
                                                            onChange={e => setQuizText(e.target.value)}
                                                            placeholder="Enter your text here..."
                                                            className="form-control textarea-large"
                                                            rows={12}
                                                        />
                                                    </div>

                                                    <div className="form-row">
                                                        <div className="form-group">
                                                            <label>Questions:</label>
                                                            <select
                                                                className="form-control"
                                                                value={numQuestions}
                                                                onChange={e => setNumQuestions(Number(e.target.value))}
                                                            >
                                                                {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                                                                    <option key={num} value={num}>{num}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div className="form-group">
                                                            <label>Difficulty:</label>
                                                            <select
                                                                className="form-control"
                                                                value={difficulty}
                                                                onChange={e => setDifficulty(e.target.value)}
                                                            >
                                                                <option value="easy">Easy</option>
                                                                <option value="medium">Medium</option>
                                                                <option value="hard">Hard</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div className="form-row">
                                                        <div className="form-group">
                                                            <label>Type:</label>
                                                            <select
                                                                className="form-control"
                                                                value={questionType}
                                                                onChange={e => setQuestionType(e.target.value)}
                                                            >
                                                                {QUESTION_TYPE_OPTIONS.map((opt) => (
                                                                    <option key={opt.value} value={opt.value}>
                                                                        {opt.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {questionType === 'mcq' && (
                                                            <div className="form-group">
                                                                <label>Options:</label>
                                                                <input
                                                                    type="number"
                                                                    min="2"
                                                                    max="6"
                                                                    value={numOptions}
                                                                    onChange={e => setNumOptions(parseInt(e.target.value, 10))}
                                                                    className="form-control"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button
                                                        className="btn btn-primary w-full mt-2"
                                                        onClick={handleQuizGenerate}
                                                        disabled={loading || !quizText}
                                                    >
                                                        {loading ? 'Generating...' : 'Generate Quiz'}
                                                    </button>

                                                    {error && <div className="error-message">{error}</div>}
                                                    {success && <div className="success-message">{success}</div>}
                                                </div>
                                            </section>

                                            {/* Output Section */}
                                            <section className="output-section">
                                                <div className="section-header">
                                                    <h2>Output</h2>
                                                    {questions.length > 0 && (
                                                        <div className="export-controls">
                                                            <select
                                                                className="form-control"
                                                                value={exportFormat}
                                                                onChange={e => setExportFormat(e.target.value)}
                                                            >
                                                                <option value="excel">Excel</option>
                                                                <option value="pdf">PDF</option>
                                                                <option value="json">JSON</option>
                                                                <option value="txt">TXT</option>
                                                            </select>
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={handleExport}
                                                                disabled={!questions.length}
                                                            >
                                                                Export
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="section-content">
                                                    {!questions.length && !loading && (
                                                        <div className="empty-state">
                                                            No quiz generated yet. Enter some text and click "Generate Quiz".
                                                        </div>
                                                    )}

                                                    {loading && (
                                                        <div className="loading-state">
                                                            <div className="spinner"></div>
                                                            <p>Generating your quiz...</p>
                                                        </div>
                                                    )}

                                                    {questions.length > 0 && (
                                                        <div className="quiz-questions">
                                                            <div className="toggle-answers">
                                                                <label className="toggle-label">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={exportContent === 'both' || exportContent === 'answers'}
                                                                        onChange={() => setExportContent(prev => 
                                                                            prev === 'questions' ? 'both' : 'questions'
                                                                        )}
                                                                    />
                                                                    <span>Show Answers</span>
                                                                </label>
                                                            </div>

                                                            <div className="questions-list">
                                                                {getFilteredQuestions().map((q, index) => (
                                                                    <div key={index} className="question-card">
                                                                        <div className="question-content">
                                                                            {q.isEditing ? (
                                                                                <div className="edit-mode">
                                                                                    <textarea
                                                                                        className="form-control"
                                                                                        value={q.question}
                                                                                        onChange={(e) => handleQuestionChange(index, 'question', e.target.value)}
                                                                                    />
                                                                                    {q.options && (
                                                                                        <div className="options-edit">
                                                                                            {q.options.map((opt, i) => (
                                                                                                <input
                                                                                                    key={i}
                                                                                                    type="text"
                                                                                                    className="form-control option-input"
                                                                                                    value={opt}
                                                                                                    onChange={(e) => handleQuestionChange(index, `option-${i}`, e.target.value)}
                                                                                                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                                                                                />
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                    <input
                                                                                        type="text"
                                                                                        className="form-control answer-input"
                                                                                        value={q.answer || ''}
                                                                                        onChange={(e) => handleQuestionChange(index, 'answer', e.target.value)}
                                                                                        placeholder="Correct answer"
                                                                                    />
                                                                                </div>
                                                                            ) : (
                                                                                <div className="view-mode">
                                                                                    <div className="question-text">
                                                                                        {index + 1}. {q.question}
                                                                                    </div>
                                                                                    {q.options && (
                                                                                        <ul className="options-list">
                                                                                            {q.options.map((opt, i) => (
                                                                                                <li key={i} className="option-item">
                                                                                                    <span className="option-label">
                                                                                                        {String.fromCharCode(65 + i)}.
                                                                                                    </span>
                                                                                                    <span>{opt}</span>
                                                                                                </li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    )}
                                                                                    {(exportContent === "both" || exportContent === "answers") && q.answer && (
                                                                                        <div className="answer-section">
                                                                                            <strong>Answer: </strong>
                                                                                            <span>{q.answer}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        
                                                                        <div className="question-actions">
                                                                            <button 
                                                                                className={`btn btn-sm ${q.isEditing ? 'btn-cancel' : 'btn-edit'}`}
                                                                                onClick={() => handleEditQuestion(index)}
                                                                            >
                                                                                {q.isEditing ? 'Cancel' : 'Edit'}
                                                                            </button>
                                                                            
                                                                            {q.isEditing && (
                                                                                <button 
                                                                                    className="btn btn-sm btn-save"
                                                                                    onClick={() => handleSaveEdits(index)}
                                                                                >
                                                                                    Save
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </section>
                                        </div>
                                    </div>
                                </PrivateRoute>
                            }
                        />
                    </Routes>
                </main>
            </div>
        </div>
    );
}

export default App;