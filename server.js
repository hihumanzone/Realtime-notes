const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json()); // For parsing JSON request bodies

// Serve the frontend (we'll create this later)
app.use(express.static('public'));

// In-memory storage for notes (replace with a database in production)
let notes = [];
let nextNoteId = 1; // Counter for generating unique note IDs

// Helper function to find a note by ID
function findNoteById(id) {
    return notes.find((note) => note._id === id);
}

// API Endpoints
// Get all notes
app.get('/api/notes', (req, res) => {
    try {
        res.json(notes);
    } catch (err) {
        console.error('Error getting notes:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create a new note
app.post('/api/notes', (req, res) => {
    try {
        const note = {
            _id: nextNoteId++,
            title: 'New Note',
            content: '',
        };

        notes.push(note);
        res.status(201).json(note);
        io.emit('note-created', note); // Broadcast to all clients
    } catch (err) {
        console.error('Error creating note:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update a note
app.put('/api/notes/:id', (req, res) => {
    try {
        const noteId = parseInt(req.params.id);
        const note = findNoteById(noteId);

        if (!note) {
            return res.status(404).json({ message: 'Note not found' });
        }

        note.title = req.body.title || note.title;
        note.content = req.body.content || note.content;

        res.json(note);
        io.emit('note-updated', note); // Broadcast to all clients
    } catch (err) {
        console.error('Error updating note:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete a note
app.delete('/api/notes/:id', (req, res) => {
    try {
        const noteId = parseInt(req.params.id);
        const noteIndex = notes.findIndex((n) => n._id === noteId);

        if (noteIndex === -1) {
            return res.status(404).json({ message: 'Note not found' });
        }

        notes.splice(noteIndex, 1);
        res.json({ message: 'Note deleted' });
        io.emit('note-deleted', noteId); // Broadcast to all clients
    } catch (err) {
        console.error('Error deleting note:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Socket.IO Connection
io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });

    // Handle note content updates (for collaborative editing)
    socket.on('note-content-change', ({ noteId, content }) => {
        try {
            const note = findNoteById(parseInt(noteId));
            if (note) {
                note.content = content;
            }
            socket.broadcast.emit('note-content-changed', { noteId, content }); // Broadcast to other clients
        } catch (err) {
            console.error('Error updating note content:', err);
        }
    });

    socket.on('note-title-change', ({ noteId, title }) => {
        try {
            const note = findNoteById(parseInt(noteId));
            if (note) {
                note.title = title;
            }
            socket.broadcast.emit('note-title-changed', { noteId, title });
        } catch (err) {
            console.error('Error updating note title:', err);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
