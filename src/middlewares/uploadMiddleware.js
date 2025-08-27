const path = require('path');
const fs = require('fs');
const multer = require('multer');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, uploadsDir),
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase();
		const base = path
			.basename(file.originalname, ext)
			.toLowerCase()
			.replace(/[^a-z0-9-_]/gi, '_');
		const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
		cb(null, `${base}-${unique}${ext}`);
	}
});

const fileFilter = (req, file, cb) => {
	if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('Invalid file type'), false);
	cb(null, true);
};

module.exports = multer({
	storage,
	fileFilter,
	limits: { fileSize: MAX_FILE_SIZE_BYTES }
});


