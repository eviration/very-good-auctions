import { Router, Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound } from '../middleware/errorHandler.js'

const router = Router()

// Get current user profile
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      const result = await dbQuery(
        'SELECT * FROM users WHERE id = @userId',
        { userId }
      )

      if (result.recordset.length === 0) {
        // User doesn't exist in our DB yet, create them
        await dbQuery(
          `INSERT INTO users (id, email, display_name, created_at, updated_at)
           VALUES (@userId, @email, @name, GETUTCDATE(), GETUTCDATE())`,
          { userId, email: req.user!.email, name: req.user!.name || req.user!.email }
        )

        res.json({
          id: userId,
          email: req.user!.email,
          name: req.user!.name || req.user!.email,
        })
        return
      }

      const user = result.recordset[0]
      res.json({
        id: user.id,
        email: user.email,
        name: user.display_name,
        phone: user.phone,
        address: user.address_line1 ? {
          line1: user.address_line1,
          line2: user.address_line2,
          city: user.city,
          state: user.state,
          postalCode: user.postal_code,
          country: user.country,
        } : null,
        createdAt: user.created_at,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Update current user profile
router.put(
  '/me',
  authenticate,
  [
    body('name').optional().isString().isLength({ min: 1, max: 255 }),
    body('phone').optional().isString(),
    body('address').optional().isObject(),
    body('address.line1').optional().isString(),
    body('address.line2').optional().isString(),
    body('address.city').optional().isString(),
    body('address.state').optional().isString(),
    body('address.postalCode').optional().isString(),
    body('address.country').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const userId = req.user!.id
      const { name, phone, address } = req.body

      await dbQuery(
        `UPDATE users SET
          display_name = COALESCE(@name, display_name),
          phone = COALESCE(@phone, phone),
          address_line1 = COALESCE(@addressLine1, address_line1),
          address_line2 = COALESCE(@addressLine2, address_line2),
          city = COALESCE(@city, city),
          state = COALESCE(@state, state),
          postal_code = COALESCE(@postalCode, postal_code),
          country = COALESCE(@country, country),
          updated_at = GETUTCDATE()
         WHERE id = @userId`,
        {
          userId,
          name: name || null,
          phone: phone || null,
          addressLine1: address?.line1 || null,
          addressLine2: address?.line2 || null,
          city: address?.city || null,
          state: address?.state || null,
          postalCode: address?.postalCode || null,
          country: address?.country || null,
        }
      )

      res.json({ message: 'Profile updated successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// Get user's auctions
router.get(
  '/me/auctions',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      // Single query with LEFT JOIN to get auctions and images together
      const result = await dbQuery(
        `SELECT a.id, a.seller_id, a.category_id, a.title, a.description, a.condition,
                a.starting_price, a.reserve_price, a.current_bid, a.bid_count,
                a.start_time, a.end_time, a.status, a.shipping_info, a.created_at, a.updated_at,
                c.name as category_name, c.slug as category_slug,
                i.id as image_id, i.blob_url, i.display_order, i.is_primary
         FROM auctions a
         LEFT JOIN categories c ON a.category_id = c.id
         LEFT JOIN auction_images i ON a.id = i.auction_id
         WHERE a.seller_id = @userId
         ORDER BY a.created_at DESC, i.display_order ASC`,
        { userId }
      )

      // Group results by auction (since JOIN creates multiple rows per auction with images)
      const auctionsMap = new Map<string, any>()

      for (const row of result.recordset) {
        if (!auctionsMap.has(row.id)) {
          auctionsMap.set(row.id, {
            id: row.id,
            title: row.title,
            description: row.description,
            condition: row.condition,
            category: row.category_name ? { id: row.category_id, name: row.category_name, slug: row.category_slug } : null,
            startingPrice: row.starting_price,
            currentBid: row.current_bid,
            bidCount: row.bid_count,
            startTime: row.start_time,
            endTime: row.end_time,
            status: row.status,
            shippingInfo: row.shipping_info,
            images: [],
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })
        }

        // Add image if exists
        if (row.image_id) {
          auctionsMap.get(row.id).images.push({
            id: row.image_id,
            auctionId: row.id,
            blobUrl: row.blob_url,
            displayOrder: row.display_order,
            isPrimary: row.is_primary,
          })
        }
      }

      res.json(Array.from(auctionsMap.values()))
    } catch (error) {
      next(error)
    }
  }
)

// Get user's bids
router.get(
  '/me/bids',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      const result = await dbQuery(
        `SELECT 
          b.*,
          a.title as auction_title,
          a.current_bid as auction_current_bid,
          a.end_time as auction_end_time,
          a.status as auction_status
         FROM bids b
         INNER JOIN auctions a ON b.auction_id = a.id
         WHERE b.bidder_id = @userId
         ORDER BY b.created_at DESC`,
        { userId }
      )

      const bids = result.recordset.map((b: any) => ({
        id: b.id,
        auctionId: b.auction_id,
        auction: {
          id: b.auction_id,
          title: b.auction_title,
          currentBid: b.auction_current_bid,
          endTime: b.auction_end_time,
          status: b.auction_status,
        },
        amount: b.amount,
        maxAmount: b.max_amount,
        isWinning: b.is_winning,
        createdAt: b.created_at,
      }))

      res.json(bids)
    } catch (error) {
      next(error)
    }
  }
)

// Get user's watchlist
router.get(
  '/me/watchlist',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      const result = await dbQuery(
        `SELECT a.*, c.name as category_name, c.slug as category_slug
         FROM watchlist w
         INNER JOIN auctions a ON w.auction_id = a.id
         LEFT JOIN categories c ON a.category_id = c.id
         WHERE w.user_id = @userId
         ORDER BY w.created_at DESC`,
        { userId }
      )

      const auctions = result.recordset.map((a: any) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        category: a.category_name ? { name: a.category_name, slug: a.category_slug } : null,
        currentBid: a.current_bid,
        bidCount: a.bid_count,
        endTime: a.end_time,
        status: a.status,
      }))

      res.json(auctions)
    } catch (error) {
      next(error)
    }
  }
)

// Add to watchlist
router.post(
  '/me/watchlist/:auctionId',
  authenticate,
  param('auctionId').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id
      const { auctionId } = req.params

      // Check auction exists
      const auctionResult = await dbQuery(
        'SELECT id FROM auctions WHERE id = @auctionId',
        { auctionId }
      )

      if (auctionResult.recordset.length === 0) {
        throw notFound('Auction not found')
      }

      // Add to watchlist (ignore if already exists)
      await dbQuery(
        `IF NOT EXISTS (SELECT 1 FROM watchlist WHERE user_id = @userId AND auction_id = @auctionId)
         INSERT INTO watchlist (user_id, auction_id, created_at) VALUES (@userId, @auctionId, GETUTCDATE())`,
        { userId, auctionId }
      )

      res.status(201).json({ message: 'Added to watchlist' })
    } catch (error) {
      next(error)
    }
  }
)

// Remove from watchlist
router.delete(
  '/me/watchlist/:auctionId',
  authenticate,
  param('auctionId').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id
      const { auctionId } = req.params

      await dbQuery(
        'DELETE FROM watchlist WHERE user_id = @userId AND auction_id = @auctionId',
        { userId, auctionId }
      )

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
)

// Get user's notifications
router.get(
  '/me/notifications',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      const result = await dbQuery(
        `SELECT * FROM notifications 
         WHERE user_id = @userId 
         ORDER BY created_at DESC`,
        { userId }
      )

      const notifications = result.recordset.map((n: any) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data ? JSON.parse(n.data) : null,
        isRead: n.is_read,
        createdAt: n.created_at,
      }))

      res.json(notifications)
    } catch (error) {
      next(error)
    }
  }
)

// Mark notification as read
router.post(
  '/me/notifications/:id/read',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id
      const { id } = req.params

      await dbQuery(
        'UPDATE notifications SET is_read = 1 WHERE id = @id AND user_id = @userId',
        { id, userId }
      )

      res.json({ message: 'Notification marked as read' })
    } catch (error) {
      next(error)
    }
  }
)

// Mark all notifications as read
router.post(
  '/me/notifications/read-all',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      await dbQuery(
        'UPDATE notifications SET is_read = 1 WHERE user_id = @userId',
        { userId }
      )

      res.json({ message: 'All notifications marked as read' })
    } catch (error) {
      next(error)
    }
  }
)

// Get user's event bids across all events
router.get(
  '/me/event-bids',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      const result = await dbQuery(
        `SELECT
          b.id,
          b.item_id,
          b.amount,
          b.is_winning,
          b.created_at,
          i.title as item_title,
          i.current_bid as item_current_bid,
          i.status as item_status,
          i.submission_status,
          e.id as event_id,
          e.name as event_name,
          e.slug as event_slug,
          e.status as event_status,
          e.end_time as event_end_time,
          e.auction_type,
          (SELECT TOP 1 blob_url FROM event_item_images WHERE item_id = i.id ORDER BY display_order ASC) as item_image
         FROM event_item_bids b
         INNER JOIN event_items i ON b.item_id = i.id
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE b.bidder_id = @userId
         ORDER BY b.created_at DESC`,
        { userId }
      )

      const bids = result.recordset.map((b: any) => ({
        id: b.id,
        amount: parseFloat(b.amount),
        isWinning: b.is_winning,
        createdAt: b.created_at,
        item: {
          id: b.item_id,
          title: b.item_title,
          currentBid: b.item_current_bid ? parseFloat(b.item_current_bid) : null,
          status: b.item_status,
          imageUrl: b.item_image,
        },
        event: {
          id: b.event_id,
          name: b.event_name,
          slug: b.event_slug,
          status: b.event_status,
          endTime: b.event_end_time,
          auctionType: b.auction_type,
        },
      }))

      res.json(bids)
    } catch (error) {
      next(error)
    }
  }
)

// Get user's submitted items across all events
router.get(
  '/me/submitted-items',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      const result = await dbQuery(
        `SELECT
          i.id,
          i.title,
          i.description,
          i.condition,
          i.starting_price,
          i.buy_now_price,
          i.current_bid,
          i.bid_count,
          i.submission_status,
          i.rejection_reason,
          i.allow_resubmit,
          i.status,
          i.created_at,
          e.id as event_id,
          e.name as event_name,
          e.slug as event_slug,
          e.status as event_status,
          e.end_time as event_end_time,
          (SELECT TOP 1 blob_url FROM event_item_images WHERE item_id = i.id ORDER BY display_order ASC) as item_image
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE i.submitted_by = @userId
         ORDER BY i.created_at DESC`,
        { userId }
      )

      const items = result.recordset.map((i: any) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        condition: i.condition,
        startingPrice: i.starting_price ? parseFloat(i.starting_price) : null,
        buyNowPrice: i.buy_now_price ? parseFloat(i.buy_now_price) : null,
        currentBid: i.current_bid ? parseFloat(i.current_bid) : null,
        bidCount: i.bid_count,
        submissionStatus: i.submission_status,
        rejectionReason: i.rejection_reason,
        allowResubmit: i.allow_resubmit,
        status: i.status,
        imageUrl: i.item_image,
        createdAt: i.created_at,
        event: {
          id: i.event_id,
          name: i.event_name,
          slug: i.event_slug,
          status: i.event_status,
          endTime: i.event_end_time,
        },
      }))

      res.json(items)
    } catch (error) {
      next(error)
    }
  }
)

export { router as userRoutes }
