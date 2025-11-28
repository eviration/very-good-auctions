-- Very Good Auctions Database Schema
-- Azure SQL Database

-- Drop existing tables (for clean setup)
IF OBJECT_ID('notifications', 'U') IS NOT NULL DROP TABLE notifications;
IF OBJECT_ID('watchlist', 'U') IS NOT NULL DROP TABLE watchlist;
IF OBJECT_ID('payments', 'U') IS NOT NULL DROP TABLE payments;
IF OBJECT_ID('bids', 'U') IS NOT NULL DROP TABLE bids;
IF OBJECT_ID('auction_images', 'U') IS NOT NULL DROP TABLE auction_images;
IF OBJECT_ID('auctions', 'U') IS NOT NULL DROP TABLE auctions;
IF OBJECT_ID('categories', 'U') IS NOT NULL DROP TABLE categories;
IF OBJECT_ID('users', 'U') IS NOT NULL DROP TABLE users;

-- Users table (extends Azure AD B2C profiles)
CREATE TABLE users (
    id NVARCHAR(128) PRIMARY KEY,  -- Azure AD B2C Object ID
    email NVARCHAR(255) NOT NULL UNIQUE,
    display_name NVARCHAR(255) NOT NULL,
    phone NVARCHAR(50) NULL,
    address_line1 NVARCHAR(255) NULL,
    address_line2 NVARCHAR(255) NULL,
    city NVARCHAR(100) NULL,
    state NVARCHAR(100) NULL,
    postal_code NVARCHAR(20) NULL,
    country NVARCHAR(100) DEFAULT 'USA',
    stripe_customer_id NVARCHAR(255) NULL,
    is_verified BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe ON users(stripe_customer_id);

-- Categories table
CREATE TABLE categories (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    slug NVARCHAR(100) NOT NULL UNIQUE,
    description NVARCHAR(500) NULL,
    icon NVARCHAR(50) NULL,
    display_order INT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETUTCDATE()
);

CREATE INDEX idx_categories_slug ON categories(slug);

-- Auctions table
CREATE TABLE auctions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    seller_id NVARCHAR(128) NOT NULL,
    category_id INT NOT NULL,
    title NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX) NOT NULL,
    condition NVARCHAR(50) NOT NULL CHECK (condition IN ('new', 'like-new', 'excellent', 'very-good', 'good', 'fair', 'poor')),
    starting_price DECIMAL(10,2) NOT NULL,
    reserve_price DECIMAL(10,2) NULL,
    current_bid DECIMAL(10,2) NOT NULL,
    bid_count INT DEFAULT 0,
    start_time DATETIME2 NOT NULL,
    end_time DATETIME2 NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'ended', 'cancelled', 'sold')),
    shipping_info NVARCHAR(500) NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    
    CONSTRAINT fk_auctions_seller FOREIGN KEY (seller_id) REFERENCES users(id),
    CONSTRAINT fk_auctions_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX idx_auctions_seller ON auctions(seller_id);
CREATE INDEX idx_auctions_category ON auctions(category_id);
CREATE INDEX idx_auctions_status ON auctions(status);
CREATE INDEX idx_auctions_end_time ON auctions(end_time);
CREATE INDEX idx_auctions_status_end ON auctions(status, end_time);

-- Auction images table
CREATE TABLE auction_images (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    auction_id UNIQUEIDENTIFIER NOT NULL,
    blob_url NVARCHAR(500) NOT NULL,
    display_order INT DEFAULT 0,
    is_primary BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    CONSTRAINT fk_images_auction FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
);

CREATE INDEX idx_auction_images_auction ON auction_images(auction_id);

-- Bids table
CREATE TABLE bids (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    auction_id UNIQUEIDENTIFIER NOT NULL,
    bidder_id NVARCHAR(128) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    max_amount DECIMAL(10,2) NULL,  -- For automatic bidding
    is_winning BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    CONSTRAINT fk_bids_auction FOREIGN KEY (auction_id) REFERENCES auctions(id),
    CONSTRAINT fk_bids_bidder FOREIGN KEY (bidder_id) REFERENCES users(id)
);

CREATE INDEX idx_bids_auction ON bids(auction_id);
CREATE INDEX idx_bids_bidder ON bids(bidder_id);
CREATE INDEX idx_bids_auction_amount ON bids(auction_id, amount DESC);
CREATE INDEX idx_bids_winning ON bids(auction_id, is_winning) WHERE is_winning = 1;

-- Payments table
CREATE TABLE payments (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    auction_id UNIQUEIDENTIFIER NOT NULL,
    payer_id NVARCHAR(128) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency NVARCHAR(3) DEFAULT 'USD',
    stripe_payment_intent_id NVARCHAR(255) NULL,
    stripe_charge_id NVARCHAR(255) NULL,
    payment_method NVARCHAR(50) NULL,
    status NVARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded')),
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    
    CONSTRAINT fk_payments_auction FOREIGN KEY (auction_id) REFERENCES auctions(id),
    CONSTRAINT fk_payments_payer FOREIGN KEY (payer_id) REFERENCES users(id)
);

CREATE INDEX idx_payments_auction ON payments(auction_id);
CREATE INDEX idx_payments_payer ON payments(payer_id);
CREATE INDEX idx_payments_stripe_intent ON payments(stripe_payment_intent_id);
CREATE INDEX idx_payments_status ON payments(status);

-- Watchlist table
CREATE TABLE watchlist (
    user_id NVARCHAR(128) NOT NULL,
    auction_id UNIQUEIDENTIFIER NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    PRIMARY KEY (user_id, auction_id),
    CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_watchlist_auction FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
);

-- Notifications table
CREATE TABLE notifications (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id NVARCHAR(128) NOT NULL,
    type NVARCHAR(50) NOT NULL CHECK (type IN ('outbid', 'auction_won', 'auction_ending', 'payment_received', 'bid_placed')),
    title NVARCHAR(255) NOT NULL,
    message NVARCHAR(500) NOT NULL,
    data NVARCHAR(MAX) NULL,  -- JSON data
    is_read BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = 0;

-- Insert default categories
INSERT INTO categories (name, slug, description, icon, display_order) VALUES
('Antiques', 'antiques', 'Vintage and antique items', 'clock', 1),
('Art', 'art', 'Paintings, sculptures, and artwork', 'palette', 2),
('Collectibles', 'collectibles', 'Rare and collectible items', 'star', 3),
('Electronics', 'electronics', 'Vintage and modern electronics', 'cpu', 4),
('Furniture', 'furniture', 'Antique and modern furniture', 'home', 5),
('Jewelry', 'jewelry', 'Fine jewelry and watches', 'gem', 6),
('Sports', 'sports', 'Sports memorabilia and equipment', 'trophy', 7),
('Vehicles', 'vehicles', 'Classic cars and vehicles', 'car', 8),
('Other', 'other', 'Other unique items', 'package', 9);

PRINT 'Database schema created successfully!';
