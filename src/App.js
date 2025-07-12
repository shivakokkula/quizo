import React, { useState } from 'react';
import './App.css';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

function parseQuizOutput(quizText) {
  const paragraphBlocks = quizText.split(/\*\*Paragraph \d+:\*\*/).filter(Boolean);

  const questions = [];
  paragraphBlocks.forEach(block => {
    const questionBlocks = block.split(/(?=Question: )/).filter(q => q.trim().startsWith("Question:"));
    questionBlocks.forEach(qb => {
      const qMatch = qb.match(/Question:\s*(.+?)\s*Options:/s);
      const optsMatch = qb.match(/Options:\s*([\s\S]*?)\s*Answer:/);
      const ansMatch = qb.match(/Answer:\s*([A-D])/);

      let options = [];
      if (optsMatch && optsMatch[1]) {
        options = optsMatch[1]
          .split(/\n|(?=[A-D]\s)/)
          .map(opt => opt.replace(/^[A-D][).]\s*/, '').trim())
          .filter(opt => opt.length > 0);
      }

      if (qMatch && options.length === 4 && ansMatch) {
        questions.push({
          question: qMatch[1].trim(),
          options,
          answer: ansMatch[1]
        });
      }
    });
  });
  return questions;
}

function App() {
  const [quizText, setQuizText] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exportType, setExportType] = useState('excel');

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setError('');
    setSuccess('');

    const reader = new FileReader();
    const fileType = file.type;

    if (fileType === 'application/pdf') {
      reader.onload = async function () {
        try {
          const typedArray = new Uint8Array(this.result);
          const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map((item) => item.str);
            text += strings.join(' ') + '\n';
          }
          setQuizText(text);
          setSuccess('PDF text extracted successfully');
        } catch (e) {
          setError('Failed to extract PDF text');
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (fileType.startsWith('text/')) {
      reader.onload = () => {
        setQuizText(reader.result);
        setSuccess('Text loaded');
      };
      reader.readAsText(file);
    } else {
      setError('Unsupported file type for frontend-only processing.');
    }
  };

  const handleQuizGenerate = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setQuestions([]);
    try {
      const res = await fetch('https://quizo-backend-aek5.onrender.com/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: quizText })
      });
      const data = await res.json();
      if (data.quiz) {
        const parsedQuestions = parseQuizOutput(data.quiz);
        setQuestions(parsedQuestions);
        setSuccess('Quiz generated successfully!');
      } else {
        setError('No quiz generated.');
      }
    } catch (err) {
      setError('Error generating quiz.');
    }
    setLoading(false);
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!questions.length) return;
    const data = questions.map((q, idx) => ({
      "No.": idx + 1,
      "Question": q.question,
      "Option A": q.options[0] || "",
      "Option B": q.options[1] || "",
      "Option C": q.options[2] || "",
      "Option D": q.options[3] || "",
      "Answer": q.answer
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Quiz");
    XLSX.writeFile(workbook, "quiz.xlsx");
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (!questions.length) return;
    const doc = new jsPDF();
    let y = 15;
    doc.setFontSize(14);
    doc.text("Quiz", 105, y, { align: "center" });
    y += 10;
    doc.setFontSize(11);

    questions.forEach((q, idx) => {
      if (y > 270) { doc.addPage(); y = 15; }
      doc.text(`${idx + 1}. ${q.question}`, 10, y);
      y += 7;
      q.options.forEach((opt, i) => {
        if (y > 270) { doc.addPage(); y = 15; }
        const isCorrect = q.answer === String.fromCharCode(65 + i);
        doc.text(
          `${String.fromCharCode(65 + i)}. ${opt}${isCorrect ? '  ✔' : ''}`,
          15,
          y
        );
        y += 6;
      });
      y += 3;
    });
    doc.save('quiz.pdf');
  };

  // Handle export selection and action
  const handleExport = () => {
    if (exportType === 'excel') handleExportExcel();
    else handleExportPDF();
  };

  return (
    <div className="app-grid">
      <div className="left-panel">
        <h2>📝 Upload or Paste Text</h2>
        <input type="file" onChange={handleUpload} className="upload-input" />
        <p className="or-text">OR</p>
        <textarea
          placeholder="Paste text here..."
          rows="10"
          className="text-input"
          value={quizText}
          onChange={(e) => setQuizText(e.target.value)}
        />

        <button className="submit-button" onClick={handleQuizGenerate} disabled={loading || !quizText}>
          {loading ? 'Generating...' : 'Generate Quiz'}
        </button>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </div>

      <div className="right-panel">
        <h2>🧠 Quiz Output</h2>
        {questions.length === 0 ? (
          <p className="no-quiz">No quiz generated yet. Upload and generate from text.</p>
        ) : (
          <div className="quiz-list">
            {questions.map((q, index) => (
              <div key={index} className="quiz-card">
                <div className="quiz-qnum">{index + 1}.</div>
                <div className="quiz-content">
                  <div className="quiz-question">{q.question}</div>
                  <ul className="quiz-options">
                    {q.options.map((opt, i) => (
                      <li key={i} className={q.answer === String.fromCharCode(65 + i) ? 'correct' : ''}>
                        <span className="option-label">{String.fromCharCode(65 + i)}.</span> {opt}
                        {q.answer === String.fromCharCode(65 + i) && (
                          <span className="correct-answer">✔</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
            <div className="export-row">
              <select
                className="export-select"
                value={exportType}
                onChange={e => setExportType(e.target.value)}
              >
                <option value="excel">Export to Excel</option>
                <option value="pdf">Export to PDF</option>
              </select>
              <button className="export-button" onClick={handleExport} disabled={!questions.length}>
                Export Quiz
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;