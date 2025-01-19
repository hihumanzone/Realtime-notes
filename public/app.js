const socket = io();

const noteList = document.getElementById('note-list');
const newNoteBtn = document.getElementById('new-note');
const noteTitleInput = document.getElementById('note-title');
const noteContentArea = document.getElementById('note-content');

let notes = []; // Local copy of notes
let activeNoteId = null;

// Fetch initial notes from the server
fetch('/api/notes')
    .then((res) => res.json())
    .then((data) => {
        notes = data;
        renderNoteList();
        if (notes.length > 0) {
            loadNote(notes[0]._id); // Load the first note by default
        }
    });

// Render the list of notes in the sidebar
function renderNoteList() {
    noteList.innerHTML = '';
    notes.forEach((note) => {
        const li = document.createElement('li');
        li.textContent = note.title;
        li.addEventListener('click', () => {
            loadNote(note._id);
            setActiveNote(note._id);
        });

        // Add a delete button to each note item
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'X';
        deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent note loading on delete button click
            deleteNote(note._id);
        });

        li.appendChild(deleteBtn);

        // Highlight the active note
        if (note._id === activeNoteId) {
            li.classList.add('active');
        }

        noteList.appendChild(li);
    });
}

// Set the active note in the sidebar
function setActiveNote(noteId) {
    activeNoteId = noteId;
    renderNoteList(); // Re-render to update the active class
}

// Load a note for editing
function loadNote(noteId) {
    const note = notes.find((n) => n._id === noteId);
    activeNoteId = noteId;
    noteTitleInput.value = note.title;
    noteContentArea.value = note.content;

    // Update active note in the sidebar
    setActiveNote(noteId);
}

// Create a new note
newNoteBtn.addEventListener('click', () => {
    fetch('/api/notes', { method: 'POST' })
        .then((res) => res.json())
        .then((newNote) => {
            // Remove the next two lines
            // notes.push(newNote);
            // renderNoteList();
            loadNote(newNote._id);
        });
});

// Delete a note
function deleteNote(noteId) {
    fetch(`/api/notes/${noteId}`, { method: 'DELETE' })
        .then((res) => {
            if (res.ok) {
                notes = notes.filter((note) => note._id !== noteId);

                // If the deleted note was the active one, load another note or clear the editor
                if (activeNoteId === noteId) {
                    activeNoteId = null;
                    if (notes.length > 0) {
                        loadNote(notes[0]._id); // Load the first note
                    } else {
                        noteTitleInput.value = '';
                        noteContentArea.value = '';
                    }
                }

                renderNoteList();
            }
        });
}

// Event listeners for title and content changes
noteTitleInput.addEventListener('input', () => {
    const newTitle = noteTitleInput.value;
    const currentNote = notes.find((n) => n._id === activeNoteId);

    if (currentNote && currentNote.title !== newTitle) {
        socket.emit('note-title-change', { noteId: activeNoteId, title: newTitle });
        updateNote(activeNoteId, newTitle, currentNote.content);
    }
});

noteContentArea.addEventListener('input', () => {
    const newContent = noteContentArea.value;
    const currentNote = notes.find((n) => n._id === activeNoteId);

    if (currentNote && currentNote.content !== newContent) {
        socket.emit('note-content-change', { noteId: activeNoteId, content: newContent });
        updateNote(activeNoteId, currentNote.title, newContent);
    }
});

function updateNote(noteId, newTitle, newContent) {
    // Update the note in the local notes array
    const noteIndex = notes.findIndex((n) => n._id === noteId);
    if (noteIndex !== -1) {
        notes[noteIndex].title = newTitle;
        notes[noteIndex].content = newContent;
    }

    // Send the update to the server
    fetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newTitle, content: newContent }),
    })
    .then(res => res.json())
    .then(updatedNote => {
        // Update the local notes array with the server's response
        const noteIndex = notes.findIndex(n => n._id === updatedNote._id);
        if (noteIndex !== -1) {
            notes[noteIndex] = updatedNote;
        }
        renderNoteList();
    })
    .catch(error => console.error('Error updating note:', error));
}

// Socket.IO event listeners for real-time updates
socket.on('note-created', (newNote) => {
    // Check if the note already exists (to prevent duplicates)
    if (!notes.some((note) => note._id === newNote._id)) {
        notes.push(newNote);
        renderNoteList();
    }
});

socket.on('note-deleted', (deletedNoteId) => {
    notes = notes.filter((note) => note._id !== parseInt(deletedNoteId));
    if (activeNoteId === parseInt(deletedNoteId)) {
        activeNoteId = null;
        noteTitleInput.value = '';
        noteContentArea.value = '';
    }
    renderNoteList();
});

socket.on('note-content-changed', ({ noteId, content }) => {
    noteId = parseInt(noteId);
    if (noteId === activeNoteId) {
        noteContentArea.value = content;
    }
    const noteIndex = notes.findIndex((n) => n._id === noteId);
    if (noteIndex !== -1) {
        notes[noteIndex].content = content;
    }
});

socket.on('note-title-changed', ({ noteId, title }) => {
    noteId = parseInt(noteId);
    if (noteId === activeNoteId) {
        noteTitleInput.value = title;
    }
    const noteIndex = notes.findIndex((n) => n._id === noteId);
    if (noteIndex !== -1) {
        notes[noteIndex].title = title;
    }
    renderNoteList();
});

socket.on('note-updated', (updatedNote) => {
    const noteIndex = notes.findIndex((n) => n._id === updatedNote._id);
    if (noteIndex !== -1) {
        notes[noteIndex] = updatedNote;
        if (updatedNote._id === activeNoteId) {
            noteTitleInput.value = updatedNote.title;
            noteContentArea.value = updatedNote.content;
        }
        renderNoteList();
    }
});