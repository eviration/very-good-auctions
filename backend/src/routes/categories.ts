import { Router, Request, Response, NextFunction } from 'express'
import { query as dbQuery } from '../config/database.js'

const router = Router()

// Get all categories
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dbQuery(
        `SELECT 
          c.*,
          (SELECT COUNT(*) FROM auctions a WHERE a.category_id = c.id AND a.status = 'active') as auction_count
         FROM categories c
         ORDER BY c.name ASC`
      )

      const categories = result.recordset.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        icon: c.icon,
        auctionCount: c.auction_count,
      }))

      res.json(categories)
    } catch (error) {
      next(error)
    }
  }
)

export { router as categoryRoutes }
