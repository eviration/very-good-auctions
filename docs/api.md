# Very Good Auctions API Documentation

Base URL: `https://api.very-good-auctions.com/api` (production) or `http://localhost:4000/api` (development)

## Authentication

All authenticated endpoints require a Bearer token from Azure AD B2C:

```
Authorization: Bearer <access_token>
```

## Endpoints

### Auctions

#### List Auctions
```http
GET /auctions
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| pageSize | number | 12 | Items per page (max 50) |
| category | string | - | Filter by category slug |
| status | string | active | Filter by status |
| search | string | - | Search in title/description |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "sellerId": "string",
      "seller": { "id": "string", "name": "string" },
      "categoryId": 1,
      "category": { "id": 1, "name": "Antiques", "slug": "antiques" },
      "title": "Vintage Clock",
      "description": "Beautiful antique...",
      "condition": "excellent",
      "startingPrice": 100,
      "currentBid": 150,
      "bidCount": 5,
      "startTime": "2024-01-01T00:00:00Z",
      "endTime": "2024-01-08T00:00:00Z",
      "status": "active",
      "shippingInfo": "Free shipping",
      "images": [
        {
          "id": "uuid",
          "blobUrl": "https://...",
          "displayOrder": 0,
          "isPrimary": true
        }
      ],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 12,
    "totalItems": 100,
    "totalPages": 9
  }
}
```

#### Get Auction
```http
GET /auctions/:id
```

**Response:** Single auction object (same structure as list item)

#### Create Auction (Auth Required)
```http
POST /auctions
```

**Request Body:**
```json
{
  "title": "Vintage Clock",
  "description": "Beautiful antique grandfather clock...",
  "categoryId": 1,
  "startingPrice": 100,
  "reservePrice": 500,
  "condition": "excellent",
  "durationDays": 7,
  "shippingInfo": "Buyer pays shipping"
}
```

**Response:**
```json
{
  "id": "uuid",
  "message": "Auction created successfully"
}
```

#### Upload Auction Image (Auth Required)
```http
POST /auctions/:id/images
Content-Type: multipart/form-data
```

**Form Data:**
- `image`: File (JPEG, PNG, max 5MB)

**Response:**
```json
{
  "id": "uuid",
  "url": "https://storage.blob.core.windows.net/..."
}
```

---

### Bids

#### Get Auction Bids
```http
GET /auctions/:auctionId/bids
```

**Response:**
```json
[
  {
    "id": "uuid",
    "auctionId": "uuid",
    "bidderId": "string",
    "bidder": { "id": "string", "name": "John D." },
    "amount": 150,
    "isWinning": true,
    "createdAt": "2024-01-02T10:30:00Z"
  }
]
```

#### Place Bid (Auth Required)
```http
POST /auctions/:auctionId/bids
```

**Request Body:**
```json
{
  "amount": 175,
  "maxAmount": 250
}
```

**Response:**
```json
{
  "id": "uuid",
  "auctionId": "uuid",
  "amount": 175,
  "isWinning": true,
  "createdAt": "2024-01-02T11:00:00Z"
}
```

**Errors:**
- `400` - Bid too low (minimum increment: $25)
- `400` - Auction ended
- `403` - Cannot bid on own auction

---

### Users

#### Get Current User (Auth Required)
```http
GET /users/me
```

**Response:**
```json
{
  "id": "string",
  "email": "user@example.com",
  "name": "John Doe",
  "phone": "+1234567890",
  "address": {
    "line1": "123 Main St",
    "city": "Seattle",
    "state": "WA",
    "postalCode": "98101",
    "country": "USA"
  },
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### Update Current User (Auth Required)
```http
PUT /users/me
```

**Request Body:**
```json
{
  "name": "John Smith",
  "phone": "+1234567890",
  "address": {
    "line1": "456 Oak Ave",
    "city": "Portland",
    "state": "OR",
    "postalCode": "97201",
    "country": "USA"
  }
}
```

#### Get User's Bids (Auth Required)
```http
GET /users/me/bids
```

#### Get User's Auctions (Auth Required)
```http
GET /users/me/auctions
```

#### Get User's Watchlist (Auth Required)
```http
GET /users/me/watchlist
```

#### Add to Watchlist (Auth Required)
```http
POST /users/me/watchlist/:auctionId
```

#### Remove from Watchlist (Auth Required)
```http
DELETE /users/me/watchlist/:auctionId
```

---

### Payments

#### Create Payment Intent (Auth Required)
```http
POST /payments/create-intent
```

**Request Body:**
```json
{
  "auctionId": "uuid",
  "amount": 175
}
```

**Response:**
```json
{
  "clientSecret": "pi_xxx_secret_xxx",
  "paymentIntentId": "pi_xxx"
}
```

#### Confirm Payment (Auth Required)
```http
POST /payments/confirm
```

**Request Body:**
```json
{
  "paymentIntentId": "pi_xxx"
}
```

---

### Categories

#### List Categories
```http
GET /categories
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Antiques",
    "slug": "antiques",
    "description": "Vintage and antique items",
    "icon": "clock"
  }
]
```

---

### Webhooks

#### Stripe Webhook
```http
POST /webhooks/stripe
```

Handles Stripe events:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

---

## Real-time Updates (SignalR)

Connect to: `wss://api.very-good-auctions.com/hubs/auction`

### Subscribe to Auction
```javascript
connection.invoke("JoinAuctionGroup", auctionId);
```

### Unsubscribe from Auction
```javascript
connection.invoke("LeaveAuctionGroup", auctionId);
```

### Events

**BidUpdate**
```json
{
  "auctionId": "uuid",
  "currentBid": 200,
  "bidCount": 10,
  "bidderId": "string",
  "bidderName": "Jane D."
}
```

**AuctionEnded**
```json
{
  "auctionId": "uuid",
  "winnerId": "string",
  "winnerName": "John D.",
  "finalBid": 500
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid bid amount",
    "details": {
      "amount": ["Must be at least $175"]
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid request data |
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| INTERNAL_ERROR | 500 | Server error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| POST /auctions/:id/bids | 10 requests/minute |
| POST /payments/* | 5 requests/minute |
| All other endpoints | 100 requests/minute |
