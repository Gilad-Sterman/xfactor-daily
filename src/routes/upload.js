import express from 'express'
import multer from 'multer'
import { uploadToCloudinary, generateSignedUrl } from '../config/cloudinary.js'

const router = express.Router()

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Only allow PDF files
        if (file.mimetype === 'application/pdf') {
            cb(null, true)
        } else {
            cb(new Error('Only PDF files are allowed'), false)
        }
    }
})

/**
 * Upload PDF file to Cloudinary
 * POST /api/upload/pdf
 */
router.post('/pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            })
        }

        const { originalname, buffer, size } = req.file
        const { materialName } = req.body

        // Validate file size (additional check)
        if (size > 10 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum 10MB allowed.'
            })
        }

        // Upload to Cloudinary
        const uploadResult = await uploadToCloudinary(
            buffer,
            originalname,
            'lesson_materials'
        )

        // Generate initial signed URL (24 hours)
        const signedUrl = generateSignedUrl(uploadResult.public_id)

        // Return upload success with file details
        res.json({
            success: true,
            message: 'File uploaded successfully',
            data: {
                id: uploadResult.public_id,
                name: materialName || originalname,
                fileName: originalname,
                fileSize: size,
                fileType: 'application/pdf',
                url: uploadResult.secure_url, // Store this in database
                signedUrl: signedUrl, // Use this for immediate access
                cloudinaryPublicId: uploadResult.public_id,
                uploadedAt: new Date().toISOString()
            }
        })

    } catch (error) {
        console.error('PDF upload error:', error)
        
        if (error.message === 'Only PDF files are allowed') {
            return res.status(400).json({
                success: false,
                message: 'Only PDF files are allowed'
            })
        }

        res.status(500).json({
            success: false,
            message: 'Failed to upload file',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        })
    }
})

/**
 * Generate new signed URL for existing file
 * POST /api/upload/signed-url
 */
router.post('/signed-url', async (req, res) => {
    try {
        const { publicId, expiresInHours = 24 } = req.body

        if (!publicId) {
            return res.status(400).json({
                success: false,
                message: 'Public ID is required'
            })
        }

        const expiresAt = Math.floor(Date.now() / 1000) + (60 * 60 * expiresInHours)
        const signedUrl = generateSignedUrl(publicId, { expires_at: expiresAt })

        res.json({
            success: true,
            data: {
                signedUrl,
                expiresAt: new Date(expiresAt * 1000).toISOString()
            }
        })

    } catch (error) {
        console.error('Signed URL generation error:', error)
        res.status(500).json({
            success: false,
            message: 'Failed to generate signed URL'
        })
    }
})

/**
 * Get file info and generate signed URL
 * GET /api/upload/file/:publicId
 */
router.get('/file/:publicId', async (req, res) => {
    try {
        const { publicId } = req.params
        
        // Generate signed URL for viewing
        const signedUrl = generateSignedUrl(publicId)
        
        res.json({
            success: true,
            data: {
                publicId,
                signedUrl,
                expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString()
            }
        })

    } catch (error) {
        console.error('File access error:', error)
        res.status(500).json({
            success: false,
            message: 'Failed to access file'
        })
    }
})

export default router
