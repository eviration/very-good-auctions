import { Router, Request, Response, NextFunction } from 'express'
import { body, query, param, validationResult } from 'express-validator'
import { v4 as uuidv4 } from 'uuid'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound } from '../middleware/errorHandler.js'
import { uploadImage } from '../services/storage.js'
import multer from 'multer'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// Get all auctions (paginated)
router.get(
  '/',
  optionalAuth,
  [
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 50 }),
    query('category').optional().isString(),
    query('status').optional().isIn(['active', 'ended', 'draft']),
    query('search').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const page = parseInt(req.query.page as string) || 1
      const pageSize = parseInt(req.query.pageSize as string) || 12
      const category = req.query.category as string
      const status = (req.query.status as string) || 'active'
      const search = req.query.search as string
      const offset = (page - 1) * pageSize

      let whereClause = 'WHERE a.status = @status'
      const params: Record<string, unknown> = { status, offset, pageSize }

      if (category) {
        whereClause += ' AND c.slug = @category'
        params.category = category
      }

      if (search) {
        whereClause += ' AND (a.title LIKE @search OR a.description LIKE @search)'
        params.search = `%${search}%`
      }

      const countResult = await dbQuery(
        `SELECT COUNT(*) as total FROM auctions a 
         LEFT JOIN categories c ON a.category_id = c.id 
         ${whereClause}`,
        params
      )

      const auctionsResult = await dbQuery(
        `SELECT 
          a.*,
          c.id as category_id, c.name as category_name, c.slug as category_slug,
          u.id as seller_id, u.display_name as seller_name
         FROM auctions a
         LEFT JOIN categories c ON a.category_id = c.id
         LEFT JOIN users u ON a.seller_id = u.id
         ${whereClause}
         ORDER BY a.end_time ASC
         OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
        params
      )

      // Get images for each auction
      const auctions = await Promise.all(
        auctionsResult.recordset.map(async (auction: any) => {
          const imagesResult = await dbQuery(
            'SELECT * FROM auction_images WHERE auction_id = @auctionId ORDER BY display_order',
            { auctionId: auction.id }
          )

          return {
            id: auction.id,
            sellerId: auction.seller_id,
            seller: auction.seller_name ? { id: auction.seller_id, name: auction.seller_name } : null,
            categoryId: auction.category_id,
            category: auction.category_name ? { 
              id: auction.category_id, 
              name: auction.category_name, 
              slug: auction.category_slug 
            } : null,
            title: auction.title,
            description: auction.description,
            condition: auction.condition,
            startingPrice: auction.starting_price,
            currentBid: auction.current_bid,
            bidCount: auction.bid_count,
            startTime: auction.start_time,
            endTime: auction.end_time,
            status: auction.status,
            shippingInfo: auction.shipping_info,
            images: imagesResult.recordset.map((img: any) => ({
              id: img.id,
              auctionId: img.auction_id,
              blobUrl: img.blob_url,
              displayOrder: img.display_order,
              isPrimary: img.is_primary,
            })),
            createdAt: auction.created_at,
            updatedAt: auction.updated_at,
          }
        })
      )

      const total = countResult.recordset[0]?.total || 0

      res.json({
        data: auctions,
        pagination: {
          page,
          pageSize,
          totalItems: total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get single auction
router.get(
  '/:id',
  optionalAuth,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params

      const result = await dbQuery(
        `SELECT 
          a.*,
          c.id as category_id, c.name as category_name, c.slug as category_slug,
          u.id as seller_id, u.display_name as seller_name, u.email as seller_email
         FROM auctions a
         LEFT JOIN categories c ON a.category_id = c.id
         LEFT JOIN users u ON a.seller_id = u.id
         WHERE a.id = @id`,
        { id }
      )

      if (result.recordset.length === 0) {
        throw notFound('Auction not found')
      }

      const auction = result.recordset[0]

      const imagesResult = await dbQuery(
        'SELECT * FROM auction_images WHERE auction_id = @auctionId ORDER BY display_order',
        { auctionId: id }
      )

      res.json({
        id: auction.id,
        sellerId: auction.seller_id,
        seller: { 
          id: auction.seller_id, 
          name: auction.seller_name,
          email: auction.seller_email,
        },
        categoryId: auction.category_id,
        category: { 
          id: auction.category_id, 
          name: auction.category_name, 
          slug: auction.category_slug 
        },
        title: auction.title,
        description: auction.description,
        condition: auction.condition,
        startingPrice: auction.starting_price,
        reservePrice: auction.reserve_price,
        currentBid: auction.current_bid,
        bidCount: auction.bid_count,
        startTime: auction.start_time,
        endTime: auction.end_time,
        status: auction.status,
        shippingInfo: auction.shipping_info,
        images: imagesResult.recordset.map((img: any) => ({
          id: img.id,
          auctionId: img.auction_id,
          blobUrl: img.blob_url,
          displayOrder: img.display_order,
          isPrimary: img.is_primary,
        })),
        createdAt: auction.created_at,
        updatedAt: auction.updated_at,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Helper to ensure user exists in database
async function ensureUserExists(user: { id: string; email: string; name?: string }) {
  const result = await dbQuery(
    'SELECT id FROM users WHERE id = @userId',
    { userId: user.id }
  )

  if (result.recordset.length === 0) {
    await dbQuery(
      `INSERT INTO users (id, email, display_name, created_at, updated_at)
       VALUES (@userId, @email, @name, GETUTCDATE(), GETUTCDATE())`,
      { userId: user.id, email: user.email, name: user.name || user.email }
    )
  }
}

// Create auction
router.post(
  '/',
  authenticate,
  [
    body('title').isString().isLength({ min: 3, max: 255 }),
    body('description').isString().isLength({ min: 10 }),
    body('categoryId').isInt(),
    body('startingPrice').isFloat({ min: 1 }),
    body('reservePrice').optional().isFloat({ min: 1 }),
    body('condition').isIn(['new', 'like-new', 'excellent', 'very-good', 'good', 'fair', 'poor']),
    body('durationDays').isInt({ min: 1, max: 30 }),
    body('shippingInfo').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const userId = req.user!.id
      const {
        title,
        description,
        categoryId,
        startingPrice,
        reservePrice,
        condition,
        durationDays,
        shippingInfo
      } = req.body

      // Ensure user exists in database before creating auction
      await ensureUserExists(req.user!)

      const id = uuidv4()
      const startTime = new Date()
      const endTime = new Date(startTime.getTime() + durationDays * 24 * 60 * 60 * 1000)

      await dbQuery(
        `INSERT INTO auctions (
          id, seller_id, category_id, title, description, condition,
          starting_price, reserve_price, current_bid, bid_count,
          start_time, end_time, status, shipping_info, created_at, updated_at
        ) VALUES (
          @id, @sellerId, @categoryId, @title, @description, @condition,
          @startingPrice, @reservePrice, @startingPrice, 0,
          @startTime, @endTime, 'active', @shippingInfo, GETUTCDATE(), GETUTCDATE()
        )`,
        {
          id,
          sellerId: userId,
          categoryId,
          title,
          description,
          condition,
          startingPrice,
          reservePrice: reservePrice || null,
          startTime,
          endTime,
          shippingInfo: shippingInfo || null,
        }
      )

      res.status(201).json({ id, message: 'Auction created successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// Upload auction image
router.post(
  '/:id/images',
  authenticate,
  param('id').isUUID(),
  upload.single('image'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      console.log('Image upload request:', { auctionId: id, userId })

      // Verify ownership
      const auction = await dbQuery(
        'SELECT seller_id FROM auctions WHERE id = @id',
        { id }
      )

      console.log('Auction lookup result:', auction.recordset)

      if (auction.recordset.length === 0) {
        throw notFound('Auction not found')
      }

      if (auction.recordset[0].seller_id !== userId) {
        console.log('Ownership mismatch:', { sellerId: auction.recordset[0].seller_id, userId })
        throw badRequest('You can only upload images to your own auctions')
      }

      if (!req.file) {
        throw badRequest('No image provided')
      }

      console.log('Uploading image:', { filename: req.file.originalname, size: req.file.size })

      const blobUrl = await uploadImage(req.file.buffer, req.file.originalname, id)

      console.log('Image uploaded to blob:', blobUrl)

      const imageId = uuidv4()
      await dbQuery(
        `INSERT INTO auction_images (id, auction_id, blob_url, display_order, is_primary, created_at)
         VALUES (@imageId, @auctionId, @blobUrl,
           (SELECT ISNULL(MAX(display_order), -1) + 1 FROM auction_images WHERE auction_id = @auctionId),
           CASE WHEN NOT EXISTS (SELECT 1 FROM auction_images WHERE auction_id = @auctionId) THEN 1 ELSE 0 END,
           GETUTCDATE())`,
        { imageId, auctionId: id, blobUrl }
      )

      res.status(201).json({ id: imageId, url: blobUrl })
    } catch (error) {
      console.error('Image upload error:', error)
      next(error)
    }
  }
)

export { router as auctionRoutes }
