const socket = io();

const noteList = document.getElementById('note-list');
const newNoteBtn = document.getElementById('new-note');
const noteTitleInput = document.getElementById('note-title');
const noteContentArea = document.getElementById('note-content');

let notes = []; // Local copy of notes
let activeNoteId = null;

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 300;

// Debounce function to limit the rate at which a function can fire
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Helper function to set cursor position in input/textarea
function setCaretPosition(ctrl, pos) {
    if (ctrl.setSelectionRange) {
        ctrl.focus();
        ctrl.setSelectionRange(pos, pos);
    }
}

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

// Debounced event listener for title input changes
noteTitleInput.addEventListener('input', debounce(() => {
    const newTitle = noteTitleInput.value;
    const currentNote = notes.find((n) => n._id === activeNoteId);

    if (currentNote && currentNote.title !== newTitle) {
        socket.emit('note-title-change', { noteId: activeNoteId, title: newTitle });
        updateNote(activeNoteId, newTitle, currentNote.content);
    }
}, DEBOUNCE_DELAY));

// Debounced event listener for content textarea changes
noteContentArea.addEventListener('input', debounce(() => {
    const newContent = noteContentArea.value;
    const currentNote = notes.find((n) => n._id === activeNoteId);

    if (currentNote && currentNote.content !== newContent) {
        socket.emit('note-content-change', { noteId: activeNoteId, content: newContent });
        updateNote(activeNoteId, currentNote.title, newContent);
    }
}, DEBOUNCE_DELAY));

// Update a note with new title and content
function updateNote(noteId, newTitle, newContent) {
    // Update the note in the local notes array
    const noteIndex = notes.findIndex((n) => n._id === noteId);
    if (noteIndex !== -1) {
        const titleChanged = notes[noteIndex].title !== newTitle;
        notes[noteIndex].title = newTitle;
        notes[noteIndex].content = newContent;

        // Only re-render the note list if the title has changed
        if (titleChanged) {
            renderNoteList();
        }
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
            if (titleChanged) {
                renderNoteList();
            }
        }
    })
    .catch(error => console.error('Error updating note:', error));
}

// Socket.IO event listeners for real-time updates

// When a new note is created by any client
socket.on('note-created', (newNote) => {
    // Check if the note already exists (to prevent duplicates)
    if (!notes.some((note) => note._id === newNote._id)) {
        notes.push(newNote);
        renderNoteList();
    }
});

// When a note is deleted by any client
socket.on('note-deleted', (deletedNoteId) => {
    notes = notes.filter((note) => note._id !== parseInt(deletedNoteId));
    if (activeNoteId === parseInt(deletedNoteId)) {
        activeNoteId = null;
        noteTitleInput.value = '';
        noteContentArea.value = '';
    }
    renderNoteList();
});

// When a note's content is changed by any client
socket.on('note-content-changed', ({ noteId, content }) => {
    noteId = parseInt(noteId);
    if (noteId === activeNoteId) {
        // Preserve the cursor position
        const cursorPosition = noteContentArea.selectionStart;
        noteContentArea.value = content;
        setCaretPosition(noteContentArea, cursorPosition);
    }
    const noteIndex = notes.findIndex((n) => n._id === noteId);
    if (noteIndex !== -1) {
        notes[noteIndex].content = content;
    }
});

// When a note's title is changed by any client
socket.on('note-title-changed', ({ noteId, title }) => {
    noteId = parseInt(noteId);
    if (noteId === activeNoteId) {
        // Preserve the cursor position
        const cursorPosition = noteTitleInput.selectionStart;
        noteTitleInput.value = title;
        setCaretPosition(noteTitleInput, cursorPosition);
    }
    const noteIndex = notes.findIndex((n) => n._id === noteId);
    if (noteIndex !== -1) {
        notes[noteIndex].title = title;
    }
    renderNoteList();
});

// When a note is updated by any client
socket.on('note-updated', (updatedNote) => {
    const noteIndex = notes.findIndex((n) => n._id === updatedNote._id);
    if (noteIndex !== -1) {
        notes[noteIndex] = updatedNote;
        if (updatedNote._id === activeNoteId) {
            // Preserve the cursor position for title
            const titleCursorPosition = noteTitleInput.selectionStart;
            noteTitleInput.value = updatedNote.title;
            setCaretPosition(noteTitleInput, titleCursorPosition);

            // Preserve the cursor position for content
            const contentCursorPosition = noteContentArea.selectionStart;
            noteContentArea.value = updatedNote.content;
            setCaretPosition(noteContentArea, contentCursorPosition);
        }
        renderNoteList();
    }
});
