import json
import os
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sargam_parser import parse_music_cell, Notebook as ParsedNotebook, MusicCell as ParsedMusicCell

app = FastAPI(title="Sargam Notebook API")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ParseRequest(BaseModel):
    lines: List[str]

class ParseResponse(BaseModel):
    directives: Dict[str, str]
    voices: Dict[str, Any]  # serialized Voice objects

# Helper to serialize dataclasses
def serialize_notebook(notebook: ParsedNotebook):
    # sargam_parser classes are dataclasses, which aren't automatically JSON serializable by default
    # but we can convert them to dicts or let FastAPI try (FastAPI handles dataclasses well).
    # However, sargam_parser structure is a bit nested.
    # Let's just return the raw JSON content for the 'load' endpoint since .imnb IS JSON.
    return {
        "imnb_version": notebook.version,
        "metadata": notebook.metadata,
        "cells": [
            {
                "cell_type": "music" if hasattr(c, 'voices') else "markdown",
                "source": [] # Reconstructed? No, we should probably read the raw file for editing
            }
        ]
    }

# We actually want to serve the raw JSON properties for the editor, 
# but also providing parsed structure could be useful. 
# For now, the requirements say "view/edit/play".
# Editing happens on the source text.
# Playing happens on the parsed events.

@app.get("/api/files")
def list_files(root: str = ".."):
    """List all .imnb files in the directory."""
    try:
        files = []
        if not os.path.exists(root):
             # Fallback to current dir if .. doesn't exist or permission issue
             root = "."
        # Walk or just listdir?
        # Let's just list files in the current directory or specified root
        # Security note: in a real app, sanitize 'root'. Here assuming trusted local environment.
        for f in os.listdir(root):
            if f.endswith(".imnb"):
                files.append(f)
        return {"files": [os.path.join(root, f) for f in files]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/notebook")
def load_notebook(path: str):
    """Load the raw JSON of an .imnb file."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = json.load(f)
        return content
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/notebook")
def save_notebook(path: str, content: Dict[str, Any] = Body(...)):
    """Save raw JSON to an .imnb file."""
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(content, f, indent=2)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/parse")
def parse_code(request: ParseRequest):
    """Parse sargam lines and return structured events for playback."""
    try:
        cell = parse_music_cell(request.lines)
        # Convert dataclass to dict for JSON response
        # We need a custom serializer or just use `dataclasses.asdict`
        from dataclasses import asdict
        return asdict(cell)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/health")
def health_check():
    return {"status": "ok"}
