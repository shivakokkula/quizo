import React, { useState } from 'react';
import './App.css';
import * as pdfjsLib from 'pdfjs-dist';

// Utility: Parse the LLM quiz output into structured questions
function parseQuizOutput(quizText) {
  // Split by paragraphs (e.g., "**Paragraph 1:**")
  const paragraphBlocks = quizText.split(/\*\*Paragraph \d+:\*\*/).filter(Boolean);

  const questions = [];
  paragraphBlocks.forEach(block => {
    // Find all questions in the block
    const questionBlocks = block.split(/(?=Question: )/).filter(q => q.trim().startsWith("Question:"));
    questionBlocks.forEach(qb => {
      const qMatch = qb.match(/Question:\s*(.+?)\s*Options:/s);
      // Options: Match "A ...", "B ...", etc. until "Answer:"
      const optsMatch = qb.match(/Options:\s*([\s\S]*?)\s*Answer:/);
      const ansMatch = qb.match(/Answer:\s*([A-D])/);

      let options = [];
      if (optsMatch && optsMatch[1]) {
        // Split options by lines starting with A, B, C, D
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
      const res = await fetch('http://localhost:8000/generate-quiz', {
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
            <button className="export-button" onClick={()=>alert("Export coming soon!")}>Export Quiz</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;