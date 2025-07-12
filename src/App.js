import React, { useState, useEffect } from "react";
import "./App.css";
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import Tesseract from "tesseract.js";
import constants from "./constants";

// take url from .env file
const SERVER_URL = constants.SERVER_URL;

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
        questions.push({ question, options, answer });
      }
    } else if (questionType === "mcq") {
      if (question && options.length === numOptions && answer) {
        questions.push({ question, options, answer });
      }
    } else if (questionType === "mcq_multiple") {
      if (question && options.length >= 2 && answer) { // Basic check, refine as per format
        questions.push({ question, options, answer });
      }
    } else if (questionType === "fillblanks") {
      if (question && answer) {
        questions.push({ question, answer });
      }
    } else if (questionType === "faq") {
      if (question && answer) {
        questions.push({ question, answer });
      }
    } else if (questionType === "short") {
      if (question && answer) {
        questions.push({ question, answer });
      }
    } else if (questionType === "higherorder") {
      if (question && answer) {
        questions.push({ question, answer });
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
  { value: "truefalse", label: "TrueFalse" },
  { value: "fillblanks", label: "Fill in the blanks" },
  { value: "faq", label: "FAQ" },
  { value: "short", label: "Short Answer" },
  { value: "higherorder", label: "Higher Order QA" },
];

function App() {
  const [quizText, setQuizText] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exportType, setExportType] = useState("excel");
  const [exportContent, setExportContent] = useState("both");
  const [numQuestions, setNumQuestions] = useState(4);
  const [difficulty, setDifficulty] = useState("medium");
  const [numOptions, setNumOptions] = useState(4);
  const [questionType, setQuestionType] = useState("mcq");
  const [theme, setTheme] = useState("light"); // Default to light mode

  useEffect(() => {
    document.body.className = theme; // Apply theme as class to the body
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === "light" ? "dark" : "light"));
  };

  // Helper to filter quiz content for export/view
  const getFilteredQuestions = () => {
    if (exportContent === "questions") {
      return questions.map(q => ({ ...q, answer: undefined, options: undefined }));
    }
    if (exportContent === "answers") {
      return questions.map(q => ({
        question: undefined,
        options: undefined,
        answer: q.answer
      }));
    }
    return questions;
  };

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setError("");
    setSuccess("");
    const reader = new FileReader();
    const fileType = file.type;
    if (fileType === "application/pdf") {
      reader.onload = async function () {
        try {
          const typedArray = new Uint8Array(this.result);
          const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
          let text = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map((item) => item.str);
            text += strings.join(" ") + "\n";
          }
          setQuizText(text);
          setSuccess("PDF text extracted successfully");
        } catch (e) {
          setError("Failed to extract PDF text");
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (fileType.startsWith("image/")) {
      setSuccess("Extracting text from image...");
      Tesseract.recognize(file, "eng")
        .then(({ data: { text } }) => {
          setQuizText(text);
          setSuccess("Image text extracted successfully");
        })
        .catch(() => {
          setError("Failed to extract text from image");
        });
    } else if (fileType.startsWith("text/")) {
      reader.onload = () => {
        setQuizText(reader.result);
        setSuccess("Text loaded");
      };
      reader.readAsText(file);
    } else {
      setError("Unsupported file type for frontend-only processing.");
    }
  };

  const handleQuizGenerate = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    setQuestions([]);
    try {
      const res = await fetch(
        SERVER_URL+"/generate-quiz",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: quizText,
            num_questions: numQuestions,
            difficulty: difficulty,
            num_options: numOptions,
            question_type: questionType,
          }),
        }
      );
      const data = await res.json();
      if (data.quiz) {
        const parsedQuestions = parseQuizOutput(data.quiz, numOptions, questionType);
        setQuestions(parsedQuestions.map(q => ({ ...q, isEditing: false }))); // Initialize editing state
        setSuccess("Quiz generated successfully!");
      } else {
        setError("No quiz generated.");
      }
    } catch (err) {
      setError("Error generating quiz.");
    } finally {
      setLoading(false);
    }
  };

  const handleEditQuestion = (index) => {
    setQuestions(prevQuestions =>
      prevQuestions.map((q, i) =>
        i === index ? { ...q, isEditing: !q.isEditing } : q
      )
    );
  };

  const handleQuestionChange = (index, field, value) => {
    setQuestions(prevQuestions =>
      prevQuestions.map((q, i) =>
        i === index ? { ...q, [field]: value } : q
      )
    );
  };

  const handleSaveEdits = () => {
    // In a real application, you would send these updated questions to a backend.
    // For this frontend-only example, the state `questions` is already updated.
    setSuccess("Edits Saved! (Frontend Only)");
    setTimeout(() => setSuccess("Quiz generated successfully!"), 2000); // Revert success message
  };


  // Export helpers (same as before, but use getFilteredQuestions())
  const handleExportExcel = () => {
    const filtered = getFilteredQuestions();
    if (!filtered.length) return;
    const data = filtered.map((q, idx) => {
      const entry = { "No.": idx + 1 };
      if (q.question) entry.Question = q.question;
      if (q.options) q.options.forEach((opt, i) => {
        entry[`Option ${String.fromCharCode(65 + i)}`] = opt || "";
      });
      if (q.answer && (exportContent === "both" || exportContent === "answers")) entry.Answer = q.answer;
      return entry;
    });
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Quiz");
    XLSX.writeFile(workbook, "quiz.xlsx");
  };

  const handleExportPDF = () => {
    const filtered = getFilteredQuestions();
    if (!filtered.length) return;
    const doc = new jsPDF();
    let y = 15;
    doc.setFontSize(14);
    doc.text("Quiz", 105, y, { align: "center" });
    y += 10;
    doc.setFontSize(11);
    filtered.forEach((q, idx) => {
      if (y > 270) { doc.addPage(); y = 15; }
      if (q.question) {
        doc.text(`${idx + 1}. ${q.question}`, 10, y);
        y += 7;
      }
      if (q.options) {
        q.options.forEach((opt, i) => {
          if (y > 270) { doc.addPage(); y = 15; }
          doc.text(`${String.fromCharCode(65 + i)}. ${opt}`, 15, y);
          y += 6;
        });
      }
      if (q.answer && (exportContent === "both" || exportContent === "answers")) {
        y += 2;
        doc.setFont("helvetica", "italic");
        doc.text(`Answer: ${q.answer}`, 15, y);
        doc.setFont("helvetica", "normal");
        y += 5;
      } else if (q.answer && (exportContent === "answers")) {
        y += 2;
        doc.setFont("helvetica", "italic");
        doc.text(`Answer: ${q.answer}`, 15, y);
        doc.setFont("helvetica", "normal");
        y += 5;
      }
      y += 3;
    });
    doc.save("quiz.pdf");
  };

  const handleExportJSON = () => {
    const filtered = getFilteredQuestions();
    if (!filtered.length) return;
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    downloadFile(url, "quiz.json");
  };

  const handleExportTXT = () => {
    const filtered = getFilteredQuestions();
    if (!filtered.length) return;
    let txt = "";
    filtered.forEach((q, idx) => {
      if (q.question) txt += `${idx + 1}. ${q.question}\n`;
      if (q.options) q.options.forEach((opt, i) => {
        txt += `  ${String.fromCharCode(65 + i)}. ${opt}\n`;
      });
      if (q.answer && (exportContent === "both" || exportContent === "answers")) txt += `  Answer: ${q.answer}\n`;
      else if (q.answer && (exportContent === "answers")) txt += `  Answer: ${q.answer}\n`;
      txt += "\n";
    });
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    downloadFile(url, "quiz.txt");
  };

  const handleCopyJSON = () => {
    const filtered = getFilteredQuestions();
    if (!filtered.length) return;
    navigator.clipboard.writeText(JSON.stringify(filtered, null, 2));
    setSuccess("Quiz copied as JSON!");
    setTimeout(() => setSuccess(""), 2000);
  };

  const handleCopyTXT = () => {
    const filtered = getFilteredQuestions();
    if (!filtered.length) return;
    let txt = "";
    filtered.forEach((q, idx) => {
      if (q.question) txt += `${idx + 1}. ${q.question}\n`;
      if (q.options) q.options.forEach((opt, i) => {
        txt += `  ${String.fromCharCode(65 + i)}. ${opt}\n`;
      });
      if (q.answer && (exportContent === "both" || exportContent === "answers")) txt += `  Answer: ${q.answer}\n`;
      else if (q.answer && (exportContent === "answers")) txt += `  Answer: ${q.answer}\n`;
      txt += "\n";
    });
    navigator.clipboard.writeText(txt);
    setSuccess("Quiz copied as TXT!");
    setTimeout(() => setSuccess(""), 2000);
  };

  const downloadFile = (url, filename) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleExport = () => {
    switch (exportType) {
      case "excel": handleExportExcel(); break;
      case "pdf": handleExportPDF(); break;
      case "json": handleExportJSON(); break;
      case "txt": handleExportTXT(); break;
      case "copyjson": handleCopyJSON(); break;
      case "copytxt": handleCopyTXT(); break;
      default: break;
    }
  };

  return (
    <div className={`app-grid ${theme}`}>
      <div className="left-panel">
        <div className="quiz-header">
          <h2>📝 Quiz Generator</h2>
          <button onClick={toggleTheme} className="theme-toggle-button">
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </button>
        </div>
        <input type="file" onChange={handleUpload} className="upload-input" accept=".pdf,.txt,image/*"/>
        <p className="or-text">OR</p>
        <textarea
          placeholder="Paste text here..."
          rows="10"
          className="text-input"
          value={quizText}
          onChange={(e) => setQuizText(e.target.value)}
        />
        <div className="form-row">
          <label>
            Number of Questions:
            <select
              value={numQuestions}
              onChange={e => setNumQuestions(Number(e.target.value))}
            >
              {[2, 4, 6, 8, 10, 12, 15, 20].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Difficulty:
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            MCQ Options:
            <select
              value={numOptions}
              onChange={e => setNumOptions(Number(e.target.value))}
            >
              {[2, 3, 4, 5, 6].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Question Type:
            <select
              value={questionType}
              onChange={e => setQuestionType(e.target.value)}
            >
              {QUESTION_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="submit-button"
          onClick={handleQuizGenerate}
          disabled={loading || !quizText}
        >
          {loading ? "Generating..." : "Generate Quiz"}
        </button>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </div>

      <div className="right-panel">
        <div className="quiz-header">
          <h2>🧠 Quiz Output</h2>
          <div className="export-row">
            <select
              className="export-select"
              value={exportType}
              onChange={(e) => setExportType(e.target.value)}
            >
              <option value="excel">Export to Excel</option>
              <option value="pdf">Export to PDF</option>
              <option value="json">Export to JSON</option>
              <option value="txt">Export to TXT</option>
              <option value="copyjson">Copy as JSON</option>
              <option value="copytxt">Copy as TXT</option>
            </select>
            <select
              className="export-select"
              value={exportContent}
              onChange={e => setExportContent(e.target.value)}
            >
              {EXPORT_CONTENT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              className="export-button"
              onClick={handleExport}
              disabled={!questions.length}
            >
              Export Quiz
            </button>
          </div>
        </div>
        {loading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
          </div>
        )}
        {questions.length === 0 && !loading ? (
          <p className="no-quiz">
            No quiz generated yet. Upload and generate from text.
          </p>
        ) : (
          <div className="quiz-list">
            {getFilteredQuestions().map((q, index) => (
              <div key={index} className="quiz-card">
                <div className="quiz-qnum">{index + 1}.</div>
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
                              <span className="option-label">
                                {String.fromCharCode(65 + i)}.
                              </span>{" "}
                              <input
                                type="text"
                                className="edit-input option-input"
                                value={q.options[i]}
                                onChange={(e) => {
                                  const newOptions = [...q.options];
                                  newOptions[i] = e.target.value;
                                  handleQuestionChange(index, 'options', newOptions);
                                }}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                      {q.answer && (
                        <div className="quiz-answer">
                          <strong>Answer:</strong>{" "}
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
                      {q.question && <div className="quiz-question">{q.question}</div>}
                      {q.options && (
                        <ul className="quiz-options">
                          {q.options.map((opt, i) => (
                            <li key={i}>
                              <span className="option-label">
                                {String.fromCharCode(65 + i)}.
                              </span>{" "}
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
                  <button className="edit-button" onClick={() => handleEditQuestion(index)}>
                    {q.isEditing ? "View" : "Edit"}
                  </button>
                </div>
              </div>
            ))}
            <button className="save-button" onClick={handleSaveEdits}>
              Save Edits
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;