import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import './App.css';

import Markdown from 'react-markdown';
import { EditorState } from '@codemirror/state';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import * as Tone from 'tone';

const API_BASE = 'http://localhost:8000/api';

function App() {
  const [notebook, setNotebook] = useState(null);
  const [filePath, setFilePath] = useState(''); 
  const [files, setFiles] = useState([]);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await fetch(`${API_BASE}/files`);
      const data = await res.json();
      setFiles(data.files);
      if (data.files.length > 0 && !filePath) {
        setFilePath(data.files[0]); // Load first file by default
      }
    } catch (err) {
      console.error("Failed to fetch files", err);
    }
  };

  useEffect(() => {
    if (filePath) {
      fetchNotebook(filePath);
    }
  }, [filePath]);

  const fetchNotebook = async (path) => {
    try {
      const res = await fetch(`${API_BASE}/notebook?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error('Failed to load notebook');
      const data = await res.json();
      setNotebook(data);
    } catch (err) {
      console.error(err);
    }
  };

  const saveNotebook = async () => {
    if (!notebook || !filePath) return;
    try {
      await fetch(`${API_BASE}/notebook?path=${encodeURIComponent(filePath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notebook),
      });
      alert('Saved!');
    } catch (err) {
      console.error(err);
      alert('Failed to save');
    }
  };

  const addCell = (type, index) => {
    if (!notebook) return;
    const newCell = type === 'markdown' 
      ? { cell_type: 'markdown', source: ['New markdown cell'] }
      : { cell_type: 'music', metadata: { language: 'sargam-v1' }, source: ['#voice melody', 'S R G M'] };
    
    const newCells = [...notebook.cells];
    // Insert after index (index is of the previous cell)
    // If index is -1, insert at start
    newCells.splice(index + 1, 0, newCell);
    setNotebook({ ...notebook, cells: newCells });
  };

  const deleteCell = (index) => {
    if (!notebook) return;
    if (confirm('Are you sure you want to delete this cell?')) {
        const newCells = [...notebook.cells];
        newCells.splice(index, 1);
        setNotebook({ ...notebook, cells: newCells });
    }
  };

  if (!notebook) return (
    <div className="app-container">
       <Sidebar files={files} activeFile={filePath} onSelectFile={setFilePath} />
       <div className="main-content" style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
         Loading...
       </div>
    </div>
  );

  return (
    <div className="app-container">
      <Sidebar files={files} activeFile={filePath} onSelectFile={setFilePath} />
      
      <div className="main-content">
        <div className="notebook-wrapper">
          <header className="app-header">
            <div>
               <h3>{notebook.metadata?.title || 'Untitled'}</h3>
               <span style={{color:'#888', fontSize:'12px'}}>{filePath.split('/').pop()}</span>
            </div>
            <div className="controls">
              <button onClick={saveNotebook}>Save Notebook</button>
            </div>
          </header>

          <div className="notebook-container">
            {notebook.cells.map((cell, idx) => (
              <React.Fragment key={idx}>
                <Cell 
                  cell={cell} 
                  onChange={(newCell) => {
                    const newCells = [...notebook.cells];
                    newCells[idx] = newCell;
                    setNotebook({ ...notebook, cells: newCells });
                  }}
                  onDelete={() => deleteCell(idx)}
                />
                <AddCellControls onAdd={(type) => addCell(type, idx)} />
              </React.Fragment>
            ))}
            {/* If empty, show simplified controls */}
            {notebook.cells.length === 0 && <AddCellControls onAdd={(type) => addCell(type, -1)} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddCellControls({ onAdd }) {
  return (
    <div className="add-cell-controls">
      <button className="add-cell-btn" onClick={() => onAdd('music')}>+ Music</button>
      <button className="add-cell-btn" onClick={() => onAdd('markdown')}>+ Markdown</button>
    </div>
  );
}

function Cell({ cell, onChange, onDelete }) {
  const isMusic = cell.cell_type === 'music';
  return (
    <div className={`cell ${isMusic ? 'music-cell' : 'markdown-cell'}`}>
      <div className="cell-header">
        <span>{cell.cell_type}</span>
        <button 
            onClick={onDelete}
            style={{
                background: 'transparent',
                color: '#ff3b30',
                border: 'none',
                padding: '0 4px',
                fontSize: '12px',
                cursor: 'pointer'
            }}
        >
            Delete
        </button>
      </div>
      {isMusic ? (
        <MusicCell cell={cell} onChange={onChange} />
      ) : (
        <MarkdownCell cell={cell} onChange={onChange} />
      )}
    </div>
  );
}

function MarkdownCell({ cell, onChange }) {
  const [editing, setEditing] = useState(false);
  const content = Array.isArray(cell.source) ? cell.source.join('\n') : cell.source;

  const handleChange = (val) => {
    onChange({ ...cell, source: val.split('\n') });
  };

  if (editing) {
    return (
      <div className="markdown-cell-content">
        <CodeMirror 
          value={content} 
          minHeight="100px" 
          extensions={[markdown()]}
          onChange={handleChange}
          onBlur={() => setEditing(false)}
          autoFocus={true}
        />
      </div>
    );
  }

  return (
    <div className="markdown-cell-content" onDoubleClick={() => setEditing(true)} style={{minHeight:'40px'}}>
      <Markdown>{content || '*Double click to edit*'}</Markdown>
    </div>
  );
}

function MusicCell({ cell, onChange }) {
  const content = Array.isArray(cell.source) ? cell.source.join('\n') : cell.source;
  const [isPlaying, setIsPlaying] = useState(false);

  const handleChange = (val) => {
    onChange({ ...cell, source: val.split('\n') });
  };

  const handlePlay = async () => {
    if (isPlaying) {
      Tone.Transport.stop();
      Tone.Transport.cancel(); // Clear all scheduled events
      setIsPlaying(false);
      return;
    }

    await Tone.start();
    
    try {
      const res = await fetch(`${API_BASE}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: content.split('\n') }),
      });
      if (!res.ok) throw new Error('Parse error');
      const data = await res.json();
      
      playMusic(data);
      setIsPlaying(true);
    } catch (e) {
      console.error(e);
      alert('Error parsing music');
    }
  };

  const playMusic = (parsedData) => {
     // Clear previous
     Tone.Transport.stop();
     Tone.Transport.cancel();

     const synth = new Tone.PolySynth(Tone.Synth).toDestination();
     const membrane = new Tone.MembraneSynth().toDestination(); // For Taal
     
     // S=C4
     const SA_FREQ = 261.63; 
     const scales = {
       'S': 0, 'r': 1, 'R': 2, 'g': 3, 'G': 4, 'm': 5, 'M': 6, 'P': 7, 'd': 8, 'D': 9, 'n': 10, 'N': 11
     };
     
     // Directives (e.g. BPM, Taal)
     const directives = parsedData.directives || {};
     const bpm = directives.tempo ? parseFloat(directives.tempo) : 120;
     Tone.Transport.bpm.value = bpm;

     // Schedule Voices
     let maxDuration = 0;

     // Schedule Taal if present
     // Simple implementation: Just a click on every beat for now, or use Cycle length
     // Format: "Tintal(16)" or "Tintal"
     if (directives.tala) {
        const match = directives.tala.match(/\d+/);
        const beatCount = match ? parseInt(match[0]) : 16; // Default to 16 if not specified
        
        // Loop a measure
        const loop = new Tone.Loop((time) => {
            // This loop triggers every quarter note (beat) by default? 
            // We need to schedule individual beats.
            // Let's just schedule a repeating event
        }, "1m"); // Tone.js Time notation depends on BPM
        
        // Simpler: Schedule a repeat
        Tone.Transport.scheduleRepeat((time) => {
           // We can track beat count here if we want Sam vs Khali
           membrane.triggerAttackRelease("C2", "8n", time);
        }, "4n"); // Every quarter note (1 beat)
     }

     Object.values(parsedData.voices).forEach(voice => {
       let time = 0; // Relative to Transport start (seconds)
       // But Transport uses beats "0:0:0".
       // Let's use seconds for simplicity since we calculate durations manually,
       // OR use Tone's measure:beat:sixteenth.
       
       // Converting beats to seconds: 60/bpm * beats
       const beatDur = 60 / bpm;

       voice.events.forEach(event => {
         if (event.duration) {
            const durSeconds = event.duration * beatDur;
            
            if (event.swara) {
               let semitones = scales[event.swara] || 0;
               if (event.variant === 'k' || event.variant === 'b') semitones -= 1;
               if (event.variant === 't' || event.variant === '#') semitones += 1;
               semitones += (event.octave || 0) * 12;
               
               const freq = SA_FREQ * Math.pow(2, semitones / 12);
               
               // Schedule
               Tone.Transport.schedule((t) => {
                   synth.triggerAttackRelease(freq, durSeconds, t);
               }, time);
            }
            
            time += durSeconds;
         }
       });
       if (time > maxDuration) maxDuration = time;
     });
     
     Tone.Transport.start();
     
     // Auto-stop
     Tone.Transport.schedule((time) => {
         Tone.Transport.stop();
         setIsPlaying(false);
     }, maxDuration + 1); // Buffer
  };

  return (
    <div className="music-cell-wrapper">
      <div className="music-controls">
         <button onClick={handlePlay}>{isPlaying ? '◼ Stop' : '▶ Play'}</button>
      </div>
      <div className="music-cell-content">
        <CodeMirror 
          value={content} 
          height="auto" 
          extensions={[markdown()]} 
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

export default App;
