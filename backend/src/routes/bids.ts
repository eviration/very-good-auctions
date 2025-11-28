import { Router, Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'
import { broadcastBidUpdate } from '../services/signalr.js'

const router = Router()

// Get bids for an auction
router.get(
  '/:id/bids',
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params

      const result = await dbQuery(
        `SELECT 
          b.*,
          u.display_name as bidder_name
         FROM bids b
         LEFT JOIN users u ON b.bidder_id = u.id
         WHERE b.auction_id = @auctionId
         ORDER BY b.amount DESC, b.created_at ASC`,
        { auctionId: id }
      )

      const bids = result.recordset.map((bid: any) => ({
        id: bid.id,
        auctionId: bid.auction_id,
        bidderId: bid.bidder_id,
        bidder: { id: bid.bidder_id, name: bid.bidder_name },
        amount: bid.amount,
        maxAmount: bid.max_amount,
        isWinning: bid.is_winning,
        createdAt: bid.created_at,
      }))

      res.json(bids)
    } catch (error) {
      next(error)
    }
  }
)

// Place a bid
router.post(
  '/:id/bids',
  authenticate,
  [
    param('id').isUUID(),
    body('amount').isFloat({ min: 1 }),
    body('maxAmount').optional().isFloat({ min: 1 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id: auctionId } = req.params
      const userId = req.user!.id
      const { amount, maxAmount } = req.body

      // Get auction details
      const auctionResult = await dbQuery(
        `SELECT * FROM auctions WHERE id = @auctionId`,
        { auctionId }
      )

      if (auctionResult.recordset.length === 0) {
        throw notFound('Auction not found')
      }

      const auction = auctionResult.recordset[0]

      // Validate auction state
      if (auction.status !== 'active') {
        throw badRequest('This auction is not active')
      }

      if (new Date(auction.end_time) < new Date()) {
        throw badRequest('This auction has ended')
      }

      if (auction.seller_id === userId) {
        throw forbidden('You cannot bid on your own auction')
      }

      // Validate bid amount
      const minBid = (auction.current_bid || auction.starting_price) + 1
      if (amount < minBid) {
        throw badRequest(`Minimum bid is $${minBid}`)
      }

      if (maxAmount && maxAmount < amount) {
        throw badRequest('Maximum bid must be greater than or equal to bid amount')
      }

      // Create bid
      const bidId = uuidv4()
      await dbQuery(
        `INSERT INTO bids (id, auction_id, bidder_id, amount, max_amount, is_winning, created_at)
         VALUES (@bidId, @auctionId, @bidderId, @amount, @maxAmount, 1, GETUTCDATE())`,
        {
          bidId,
          auctionId,
          bidderId: userId,
          amount,
          maxAmount: maxAmount || null,
        }
      )

      // Update previous winning bid
      await dbQuery(
        `UPDATE bids SET is_winning = 0 
         WHERE auction_id = @auctionId AND id != @bidId AND is_winning = 1`,
        { auctionId, bidId }
      )

      // Update auction current bid and count
      await dbQuery(
        `UPDATE auctions 
         SET current_bid = @amount, 
             bid_count = bid_count + 1,
             updated_at = GETUTCDATE()
         WHERE id = @auctionId`,
        { auctionId, amount }
      )

      // Get bidder name for broadcast
      const userResult = await dbQuery(
        'SELECT display_name FROM users WHERE id = @userId',
        { userId }
      )
      const bidderName = userResult.recordset[0]?.display_name || 'Anonymous'

      // Broadcast bid update via SignalR
      broadcastBidUpdate({
        auctionId,
        currentBid: amount,
        bidCount: auction.bid_count + 1,
        bidderId: userId,
        bidderName,
      })

      res.status(201).json({
        id: bidId,
        auctionId,
        amount,
        maxAmount,
        isWinning: true,
        createdAt: new Date().toISOString(),
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as bidRoutes }
