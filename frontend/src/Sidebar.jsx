import React from 'react';

export function Sidebar({ files, activeFile, onSelectFile }) {
  return (
    <div className="sidebar">
      <h3>Files</h3>
      <ul className="file-list">
        {files.map(file => (
          <li 
            key={file} 
            className={file === activeFile ? 'active' : ''}
            onClick={() => onSelectFile(file)}
          >
            {file.split('/').pop()}
          </li>
        ))}
      </ul>
    </div>
  );
}
