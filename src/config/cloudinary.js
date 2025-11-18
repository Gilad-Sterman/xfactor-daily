import { v2 as cloudinary } from 'cloudinary'
import dotenv from 'dotenv'

dotenv.config()

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
})

/**
 * Create a safe filename for Cloudinary public_id
 * Handles Hebrew characters, URL encoding, and special characters
 * @param {string} fileName - Original filename
 * @returns {string} Safe filename for Cloudinary
 */
const createSafeFilename = (fileName) => {
    try {
        // First, decode any URL encoding (like %20, %23, etc.)
        let decodedName = decodeURIComponent(fileName)
        
        // Remove file extension
        const nameWithoutExt = decodedName.replace(/\.[^/.]+$/, "")
        
        // Replace Hebrew characters with Latin transliteration
        const safeFilename = nameWithoutExt
            .replace(/[א-ת]/g, (match) => {
                // Hebrew to Latin transliteration map
                const hebrewToLatin = {
                    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
                    'ח': 'h', 'ט': 't', 'י': 'y', 'כ': 'k', 'ל': 'l', 'מ': 'm', 'ן': 'n',
                    'נ': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p', 'ץ': 'tz', 'צ': 'tz', 'ק': 'k',
                    'ר': 'r', 'ש': 'sh', 'ת': 't', 'ך': 'k', 'ם': 'm', 'ף': 'f'
                }
                return hebrewToLatin[match] || 'x'
            })
            // Replace spaces with underscores
            .replace(/\s+/g, '_')
            // Replace problematic characters (including #, %, and other special chars)
            .replace(/[^\w\-]/g, '_')
            // Clean up multiple underscores
            .replace(/_{2,}/g, '_')
            // Remove leading/trailing underscores and dashes
            .replace(/^[_\-]+|[_\-]+$/g, '')
            .toLowerCase()
        
        // Ensure we have a valid filename (minimum 3 characters)
        const finalFilename = safeFilename || 'file'
        return finalFilename.length < 3 ? `file_${Date.now() % 1000}` : finalFilename
        
    } catch (error) {
        // If decoding fails, create a simple safe filename
        console.warn('Error processing filename:', fileName, error)
        return `file_${Date.now() % 1000}`
    }
}

/**
 * Upload file to Cloudinary with private access
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - Original file name
 * @param {string} folder - Cloudinary folder path
 * @returns {Promise<Object>} Upload result
 */
export const uploadToCloudinary = async (fileBuffer, fileName, folder = 'lesson_materials') => {
    try {
        return new Promise((resolve, reject) => {
            const safeFilename = createSafeFilename(fileName)
            
            const uploadOptions = {
                resource_type: 'raw', // For PDFs and other non-image files
                folder: folder,
                public_id: `${Date.now()}_${safeFilename}`, // Use safe filename for public_id
                access_mode: 'authenticated', // Private access - requires signed URLs
                type: 'private', // Private delivery type
                use_filename: false,
                unique_filename: true,
                overwrite: false
            }

            cloudinary.uploader.upload_stream(
                uploadOptions,
                (error, result) => {
                    if (error) {
                        console.error('Cloudinary upload error:', error)
                        reject(error)
                    } else {
                        resolve(result)
                    }
                }
            ).end(fileBuffer)
        })
    } catch (error) {
        console.error('Error uploading to Cloudinary:', error)
        throw error
    }
}

/**
 * Generate signed URL for private file access
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} options - Additional options
 * @returns {string} Signed URL
 */
export const generateSignedUrl = (publicId, options = {}) => {
    try {
        const defaultOptions = {
            resource_type: 'raw',
            type: 'private',
            expires_at: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // 24 hours expiry
            ...options
        }

        // Use cloudinary.url for generating signed URLs for private resources
        return cloudinary.url(publicId, {
            ...defaultOptions,
            sign_url: true,
            secure: true
        })
    } catch (error) {
        console.error('Error generating signed URL:', error)
        throw error
    }
}

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteFromCloudinary = async (publicId) => {
    try {
        return await cloudinary.uploader.destroy(publicId, {
            resource_type: 'raw',
            type: 'private'
        })
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error)
        throw error
    }
}

export default cloudinary
