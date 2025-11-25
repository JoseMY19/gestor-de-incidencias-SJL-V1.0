const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs'); // Import bcrypt
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = 3000;

// Configurar Multer para subida de archivos
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir)); // Servir imágenes subidas

// --- ROUTES ---

// AUTENTICACIÓN: Iniciar sesión
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await prisma.user.findUnique({
            where: { username }
        });

        if (user) {
            // Verificar si la contraseña está hasheada
            // Si no está hasheada (legacy), comparar directamente. Si sí, usar bcrypt.
            const isMatch = user.password.startsWith('$2')
                ? await bcrypt.compare(password, user.password)
                : user.password === password;

            if (isMatch) {
                const { password, ...userInfo } = user;
                res.json(userInfo);
                return;
            }
        }

        res.status(401).json({ error: 'Credenciales incorrectas' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// AUTENTICACIÓN: Registro
app.post('/api/register', async (req, res) => {
    const { username, password, name } = req.body;
    try {
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: { username, password: hashedPassword, name, role: 'user' }
        });

        const { password: _, ...userInfo } = newUser;
        res.status(201).json(userInfo);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al registrar usuario' });
    }
});

// OBTENER todas las incidencias
app.get('/api/incidents', async (req, res) => {
    try {
        const incidents = await prisma.incident.findMany({
            orderBy: { createdAt: 'desc' },
            include: { postedBy: { select: { name: true, username: true } } }
        });
        res.json(incidents);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener incidencias' });
    }
});

// CREAR nueva incidencia (Multipart)
app.post('/api/incidents', upload.single('image'), async (req, res) => {
    const { code, name, type, status, location, timestamp, occurrenceTime, lat, lng, reportedBy, description, userId } = req.body;
    const imageFile = req.file;

    if (!name || !type) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    try {
        const newIncident = await prisma.incident.create({
            data: {
                code,
                name,
                type,
                status,
                location,
                timestamp: new Date(timestamp),
                occurrenceTime: occurrenceTime ? new Date(occurrenceTime) : new Date(),
                imageUrl: imageFile ? `/uploads/${imageFile.filename}` : null,
                lat,
                lng,
                lat,
                lng,
                reportedBy,
                description,
                userId: userId ? parseInt(userId) : null
            }
        });
        res.status(201).json(newIncident);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al guardar incidencia' });
    }
});

// ACTUALIZAR incidencia (Multipart para posible actualización de imagen)
app.put('/api/incidents/:code', upload.single('image'), async (req, res) => {
    const { code } = req.params;
    // Extract fields that might be updated
    const { name, type, status, location, occurrenceTime, reportedBy, description } = req.body;
    const imageFile = req.file;

    const updateData = {};
    if (name) updateData.name = name;
    if (type) updateData.type = type;
    if (status) updateData.status = status;
    if (location) updateData.location = location;
    if (occurrenceTime) updateData.occurrenceTime = new Date(occurrenceTime);
    if (reportedBy) updateData.reportedBy = reportedBy;
    if (description) updateData.description = description;
    if (imageFile) updateData.imageUrl = `/uploads/${imageFile.filename}`;

    try {
        const updated = await prisma.incident.update({
            where: { code },
            data: updateData
        });
        res.json(updated);
    } catch (e) {
        console.error(e);
        res.status(404).json({ error: 'Incidencia no encontrada o error al actualizar' });
    }
});

// ELIMINAR incidencia
app.delete('/api/incidents/:code', async (req, res) => {
    const { code } = req.params;
    try {
        await prisma.incident.delete({
            where: { code }
        });
        res.json({ message: 'Eliminado correctamente' });
    } catch (e) {
        console.error(e);
        res.status(404).json({ error: 'Incidencia no encontrada' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
