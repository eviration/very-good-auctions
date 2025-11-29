import { Router, Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound } from '../middleware/errorHandler.js'

const router = Router()

// Helper to ensure user exists
async function ensureUserExists(userId: string, email: string, name: string) {
  const existing = await dbQuery(
    'SELECT id FROM users WHERE id = @userId',
    { userId }
  )

  if (existing.recordset.length === 0) {
    await dbQuery(
      `INSERT INTO users (id, email, display_name, created_at, updated_at)
       VALUES (@userId, @email, @name, GETUTCDATE(), GETUTCDATE())`,
      { userId, email, name: name || email }
    )
  }
}

// Helper to calculate minimum bid
function calculateMinBid(currentBid: number | null, startingPrice: number, incrementType: string, incrementValue: number): number {
  const baseBid = currentBid || startingPrice || 0

  if (incrementType === 'percent') {
    return Math.ceil((baseBid * (1 + incrementValue / 100)) * 100) / 100
  } else {
    return baseBid + incrementValue
  }
}

// Place bid on item (standard auction)
router.post(
  '/event-items/:id/bids',
  authenticate,
  [
    param('id').isUUID(),
    body('amount').isFloat({ min: 0.01 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const userId = req.user!.id
      const { amount } = req.body

      // Ensure user exists
      await ensureUserExists(userId, req.user!.email, req.user!.name)

      // Get item with event info
      const itemResult = await dbQuery(
        `SELECT i.*, e.auction_type, e.increment_type, e.increment_value, e.status as event_status,
                e.owner_id as event_owner_id, e.organization_id
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE i.id = @id`,
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Validate event is active
      if (item.event_status !== 'active') {
        throw badRequest('This auction is not currently active')
      }

      // Validate item is available for bidding
      if (item.submission_status !== 'approved' || item.status !== 'active') {
        throw badRequest('This item is not available for bidding')
      }

      // Validate auction type is standard
      if (item.auction_type !== 'standard') {
        throw badRequest('This is a silent auction. Use the silent bid endpoint.')
      }

      // Cannot bid on own item
      if (item.submitted_by === userId) {
        throw badRequest('Cannot bid on your own item')
      }

      // Check if user is the event owner (shouldn't bid on their own event)
      if (item.event_owner_id === userId) {
        throw badRequest('Event owners cannot bid on items in their own events')
      }

      // Calculate minimum bid
      const minBid = calculateMinBid(
        item.current_bid ? parseFloat(item.current_bid) : null,
        item.starting_price ? parseFloat(item.starting_price) : 0,
        item.increment_type,
        parseFloat(item.increment_value)
      )

      if (amount < minBid) {
        throw badRequest(`Minimum bid is $${minBid.toFixed(2)}`)
      }

      // Start transaction
      // Mark previous winning bid as not winning
      await dbQuery(
        `UPDATE event_item_bids SET is_winning = 0 WHERE item_id = @itemId AND is_winning = 1`,
        { itemId: id }
      )

      // Insert new bid
      const bidResult = await dbQuery(
        `INSERT INTO event_item_bids (item_id, bidder_id, amount, is_winning, created_at)
         OUTPUT INSERTED.*
         VALUES (@itemId, @bidderId, @amount, 1, GETUTCDATE())`,
        { itemId: id, bidderId: userId, amount }
      )

      const bid = bidResult.recordset[0]

      // Update item's current bid and count
      await dbQuery(
        `UPDATE event_items SET
          current_bid = @amount,
          bid_count = bid_count + 1,
          updated_at = GETUTCDATE()
         WHERE id = @itemId`,
        { itemId: id, amount }
      )

      // Update event total bids
      await dbQuery(
        `UPDATE auction_events SET
          total_bids = total_bids + 1,
          updated_at = GETUTCDATE()
         WHERE id = @eventId`,
        { eventId: item.event_id }
      )

      // TODO: Notify previous high bidder that they've been outbid
      // TODO: Broadcast via SignalR for real-time updates

      // Calculate next minimum bid
      const nextMinBid = calculateMinBid(amount, item.starting_price, item.increment_type, parseFloat(item.increment_value))

      res.status(201).json({
        id: bid.id,
        itemId: bid.item_id,
        amount: parseFloat(bid.amount),
        isWinning: bid.is_winning,
        createdAt: bid.created_at,
        nextMinBid,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get bid history for item (standard auction)
router.get(
  '/event-items/:id/bids',
  optionalAuth,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params

      // Get item to verify it's a standard auction
      const itemResult = await dbQuery(
        `SELECT i.*, e.auction_type, e.status as event_status
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE i.id = @id`,
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      if (item.auction_type !== 'standard') {
        throw badRequest('Bid history is not available for silent auctions')
      }

      // Get bid history
      const result = await dbQuery(
        `SELECT b.*, u.display_name as bidder_name
         FROM event_item_bids b
         LEFT JOIN users u ON b.bidder_id = u.id
         WHERE b.item_id = @itemId
         ORDER BY b.amount DESC, b.created_at ASC`,
        { itemId: id }
      )

      const bids = result.recordset.map((b: any) => ({
        id: b.id,
        amount: parseFloat(b.amount),
        bidderName: b.bidder_name,
        isWinning: b.is_winning,
        createdAt: b.created_at,
      }))

      res.json(bids)
    } catch (error) {
      next(error)
    }
  }
)

// Place or increase silent bid
router.post(
  '/event-items/:id/silent-bids',
  authenticate,
  [
    param('id').isUUID(),
    body('amount').isFloat({ min: 0.01 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const userId = req.user!.id
      const { amount } = req.body

      // Ensure user exists
      await ensureUserExists(userId, req.user!.email, req.user!.name)

      // Get item with event info
      const itemResult = await dbQuery(
        `SELECT i.*, e.auction_type, e.increment_type, e.increment_value, e.status as event_status,
                e.owner_id as event_owner_id
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE i.id = @id`,
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Validate event is active
      if (item.event_status !== 'active') {
        throw badRequest('This auction is not currently active')
      }

      // Validate item is available for bidding
      if (item.submission_status !== 'approved' || item.status !== 'active') {
        throw badRequest('This item is not available for bidding')
      }

      // Validate auction type is silent
      if (item.auction_type !== 'silent') {
        throw badRequest('This is a standard auction. Use the regular bid endpoint.')
      }

      // Cannot bid on own item
      if (item.submitted_by === userId) {
        throw badRequest('Cannot bid on your own item')
      }

      // Check if user is the event owner
      if (item.event_owner_id === userId) {
        throw badRequest('Event owners cannot bid on items in their own events')
      }

      // Calculate minimum bid for new bidders
      const minBid = calculateMinBid(
        item.current_bid ? parseFloat(item.current_bid) : null,
        item.starting_price ? parseFloat(item.starting_price) : 0,
        item.increment_type,
        parseFloat(item.increment_value)
      )

      // Check if user already has a bid
      const existingBidResult = await dbQuery(
        'SELECT * FROM event_item_silent_bids WHERE item_id = @itemId AND bidder_id = @bidderId',
        { itemId: id, bidderId: userId }
      )

      if (existingBidResult.recordset.length > 0) {
        // Update existing bid
        const existingBid = existingBidResult.recordset[0]
        const currentAmount = parseFloat(existingBid.amount)

        if (amount <= currentAmount) {
          throw badRequest(`Your new bid must be higher than your current bid of $${currentAmount.toFixed(2)}`)
        }

        // Calculate minimum increase
        const minIncrease = calculateMinBid(
          currentAmount,
          item.starting_price,
          item.increment_type,
          parseFloat(item.increment_value)
        )

        if (amount < minIncrease) {
          throw badRequest(`Minimum bid increase is $${minIncrease.toFixed(2)}`)
        }

        await dbQuery(
          `UPDATE event_item_silent_bids SET
            amount = @amount,
            increase_count = increase_count + 1,
            last_increased_at = GETUTCDATE(),
            updated_at = GETUTCDATE()
           WHERE id = @bidId`,
          { bidId: existingBid.id, amount }
        )

        // Update item current_bid if this is the new highest
        await dbQuery(
          `UPDATE event_items SET
            current_bid = (SELECT MAX(amount) FROM event_item_silent_bids WHERE item_id = @itemId),
            updated_at = GETUTCDATE()
           WHERE id = @itemId`,
          { itemId: id }
        )

        // Check user's ranking
        const rankResult = await dbQuery(
          `SELECT COUNT(*) + 1 as rank FROM event_item_silent_bids
           WHERE item_id = @itemId AND (amount > @amount OR (amount = @amount AND created_at < (
             SELECT created_at FROM event_item_silent_bids WHERE id = @bidId
           )))`,
          { itemId: id, amount, bidId: existingBid.id }
        )

        res.json({
          id: existingBid.id,
          amount,
          rank: rankResult.recordset[0].rank,
          message: 'Bid increased successfully',
        })
      } else {
        // New bid
        if (amount < minBid) {
          throw badRequest(`Minimum bid is $${minBid.toFixed(2)}`)
        }

        const bidResult = await dbQuery(
          `INSERT INTO event_item_silent_bids (item_id, bidder_id, amount, initial_amount, created_at, updated_at)
           OUTPUT INSERTED.*
           VALUES (@itemId, @bidderId, @amount, @amount, GETUTCDATE(), GETUTCDATE())`,
          { itemId: id, bidderId: userId, amount }
        )

        const bid = bidResult.recordset[0]

        // Update item bid count and current_bid
        await dbQuery(
          `UPDATE event_items SET
            bid_count = bid_count + 1,
            current_bid = (SELECT MAX(amount) FROM event_item_silent_bids WHERE item_id = @itemId),
            updated_at = GETUTCDATE()
           WHERE id = @itemId`,
          { itemId: id }
        )

        // Update event total bids
        await dbQuery(
          `UPDATE auction_events SET
            total_bids = total_bids + 1,
            updated_at = GETUTCDATE()
           WHERE id = @eventId`,
          { eventId: item.event_id }
        )

        // Check user's ranking
        const rankResult = await dbQuery(
          `SELECT COUNT(*) + 1 as rank FROM event_item_silent_bids
           WHERE item_id = @itemId AND (amount > @amount OR (amount = @amount AND created_at < @createdAt))`,
          { itemId: id, amount, createdAt: bid.created_at }
        )

        // TODO: If user pushed someone else down from #1, notify them

        res.status(201).json({
          id: bid.id,
          amount: parseFloat(bid.amount),
          rank: rankResult.recordset[0].rank,
          message: 'Bid placed successfully',
        })
      }
    } catch (error) {
      next(error)
    }
  }
)

// Get user's silent bid on an item
router.get(
  '/event-items/:id/my-bid',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Get user's bid
      const bidResult = await dbQuery(
        'SELECT * FROM event_item_silent_bids WHERE item_id = @itemId AND bidder_id = @bidderId',
        { itemId: id, bidderId: userId }
      )

      if (bidResult.recordset.length === 0) {
        res.json({ hasBid: false })
        return
      }

      const bid = bidResult.recordset[0]

      // Get ranking
      const rankResult = await dbQuery(
        `SELECT COUNT(*) + 1 as rank FROM event_item_silent_bids
         WHERE item_id = @itemId AND (amount > @amount OR (amount = @amount AND created_at < @createdAt))`,
        { itemId: id, amount: bid.amount, createdAt: bid.created_at }
      )

      // Get total bidder count
      const countResult = await dbQuery(
        'SELECT COUNT(*) as total FROM event_item_silent_bids WHERE item_id = @itemId',
        { itemId: id }
      )

      res.json({
        hasBid: true,
        id: bid.id,
        amount: parseFloat(bid.amount),
        initialAmount: parseFloat(bid.initial_amount),
        increaseCount: bid.increase_count,
        rank: rankResult.recordset[0].rank,
        totalBidders: countResult.recordset[0].total,
        notifyOnOutbid: bid.notify_on_outbid,
        createdAt: bid.created_at,
        lastIncreasedAt: bid.last_increased_at,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Toggle outbid notifications for silent bid
router.put(
  '/event-items/:id/silent-bids/notify',
  authenticate,
  [
    param('id').isUUID(),
    body('notify').isBoolean(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const userId = req.user!.id
      const { notify } = req.body

      const result = await dbQuery(
        `UPDATE event_item_silent_bids SET
          notify_on_outbid = @notify,
          updated_at = GETUTCDATE()
         OUTPUT INSERTED.*
         WHERE item_id = @itemId AND bidder_id = @bidderId`,
        { itemId: id, bidderId: userId, notify: notify ? 1 : 0 }
      )

      if (result.recordset.length === 0) {
        throw notFound('Bid not found')
      }

      res.json({ notifyOnOutbid: result.recordset[0].notify_on_outbid })
    } catch (error) {
      next(error)
    }
  }
)

// Buy now
router.post(
  '/event-items/:id/buy-now',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Ensure user exists
      await ensureUserExists(userId, req.user!.email, req.user!.name)

      // Get item with event info
      const itemResult = await dbQuery(
        `SELECT i.*, e.buy_now_enabled, e.status as event_status, e.owner_id as event_owner_id
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE i.id = @id`,
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Validate event is active
      if (item.event_status !== 'active') {
        throw badRequest('This auction is not currently active')
      }

      // Validate item is available
      if (item.submission_status !== 'approved' || item.status !== 'active') {
        throw badRequest('This item is not available')
      }

      // Validate buy now is enabled
      if (!item.buy_now_enabled) {
        throw badRequest('Buy now is not enabled for this event')
      }

      if (!item.buy_now_price) {
        throw badRequest('This item does not have a buy now price')
      }

      // Cannot buy own item
      if (item.submitted_by === userId) {
        throw badRequest('Cannot buy your own item')
      }

      if (item.event_owner_id === userId) {
        throw badRequest('Event owners cannot buy items in their own events')
      }

      // Check if already purchased
      if (item.buy_now_purchased_by) {
        throw badRequest('This item has already been purchased')
      }

      // Update item as sold
      await dbQuery(
        `UPDATE event_items SET
          status = 'sold',
          buy_now_purchased_by = @userId,
          buy_now_purchased_at = GETUTCDATE(),
          winner_id = @userId,
          updated_at = GETUTCDATE()
         WHERE id = @id`,
        { id, userId }
      )

      // Update event total raised
      await dbQuery(
        `UPDATE auction_events SET
          total_raised = total_raised + @amount,
          updated_at = GETUTCDATE()
         WHERE id = @eventId`,
        { eventId: item.event_id, amount: item.buy_now_price }
      )

      // TODO: Process payment
      // TODO: Notify all bidders that the item has been sold
      // TODO: Notify the submitter

      res.json({
        message: 'Item purchased successfully',
        itemId: id,
        amount: parseFloat(item.buy_now_price),
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get current bid info (for both standard and silent - shows top bid amount)
router.get(
  '/event-items/:id/current-bid',
  optionalAuth,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params

      const itemResult = await dbQuery(
        `SELECT i.*, e.auction_type, e.increment_type, e.increment_value
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE i.id = @id`,
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      const currentBid = item.current_bid ? parseFloat(item.current_bid) : null
      const startingPrice = item.starting_price ? parseFloat(item.starting_price) : 0
      const minBid = calculateMinBid(currentBid, startingPrice, item.increment_type, parseFloat(item.increment_value))

      res.json({
        currentBid,
        startingPrice,
        minBid,
        bidCount: item.bid_count,
        incrementType: item.increment_type,
        incrementValue: parseFloat(item.increment_value),
        buyNowPrice: item.buy_now_price ? parseFloat(item.buy_now_price) : null,
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as eventBidRoutes }
