-- Create tables if they don't exist
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='categories' AND xtype='U')
CREATE TABLE categories (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(100) NOT NULL,
  slug NVARCHAR(100) NOT NULL UNIQUE,
  description NVARCHAR(500),
  icon NVARCHAR(100),
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  updated_at DATETIME2 DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
CREATE TABLE users (
  id NVARCHAR(100) PRIMARY KEY,
  email NVARCHAR(255) NOT NULL UNIQUE,
  display_name NVARCHAR(255) NOT NULL,
  avatar_url NVARCHAR(500),
  phone NVARCHAR(50),
  address_line1 NVARCHAR(255),
  address_line2 NVARCHAR(255),
  address_city NVARCHAR(100),
  address_state NVARCHAR(100),
  address_postal_code NVARCHAR(20),
  address_country NVARCHAR(100),
  stripe_customer_id NVARCHAR(100),
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  updated_at DATETIME2 DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='auctions' AND xtype='U')
CREATE TABLE auctions (
  id NVARCHAR(100) PRIMARY KEY,
  seller_id NVARCHAR(100) NOT NULL,
  category_id INT NOT NULL,
  title NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX) NOT NULL,
  condition NVARCHAR(50) NOT NULL,
  starting_price DECIMAL(10,2) NOT NULL,
  reserve_price DECIMAL(10,2),
  current_bid DECIMAL(10,2) NOT NULL,
  bid_count INT DEFAULT 0,
  start_time DATETIME2 NOT NULL,
  end_time DATETIME2 NOT NULL,
  status NVARCHAR(50) NOT NULL,
  shipping_info NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  updated_at DATETIME2 DEFAULT GETUTCDATE(),
  FOREIGN KEY (seller_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='auction_images' AND xtype='U')
CREATE TABLE auction_images (
  id NVARCHAR(100) PRIMARY KEY,
  auction_id NVARCHAR(100) NOT NULL,
  blob_url NVARCHAR(500) NOT NULL,
  display_order INT DEFAULT 0,
  is_primary BIT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='bids' AND xtype='U')
CREATE TABLE bids (
  id NVARCHAR(100) PRIMARY KEY,
  auction_id NVARCHAR(100) NOT NULL,
  bidder_id NVARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  max_amount DECIMAL(10,2),
  is_winning BIT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (bidder_id) REFERENCES users(id)
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='watchlist' AND xtype='U')
CREATE TABLE watchlist (
  user_id NVARCHAR(100) NOT NULL,
  auction_id NVARCHAR(100) NOT NULL,
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  PRIMARY KEY (user_id, auction_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='notifications' AND xtype='U')
CREATE TABLE notifications (
  id NVARCHAR(100) PRIMARY KEY,
  user_id NVARCHAR(100) NOT NULL,
  type NVARCHAR(50) NOT NULL,
  title NVARCHAR(255) NOT NULL,
  message NVARCHAR(MAX) NOT NULL,
  data NVARCHAR(MAX),
  is_read BIT DEFAULT 0,
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='payments' AND xtype='U')
CREATE TABLE payments (
  id NVARCHAR(100) PRIMARY KEY,
  auction_id NVARCHAR(100) NOT NULL,
  payer_id NVARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency NVARCHAR(3) DEFAULT 'USD',
  stripe_payment_intent_id NVARCHAR(255),
  stripe_charge_id NVARCHAR(255),
  payment_method NVARCHAR(50) NOT NULL,
  status NVARCHAR(50) NOT NULL,
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  updated_at DATETIME2 DEFAULT GETUTCDATE(),
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (payer_id) REFERENCES users(id)
);
GO

-- Insert default categories if the table is empty
IF NOT EXISTS (SELECT * FROM categories)
BEGIN
  INSERT INTO categories (name, slug, description) VALUES
  ('Electronics', 'electronics', 'Computers, phones, cameras, and other electronic devices'),
  ('Collectibles & Art', 'collectibles-art', 'Rare collectibles, fine art, and memorabilia'),
  ('Home & Garden', 'home-garden', 'Furniture, decor, appliances, and outdoor items'),
  ('Fashion & Accessories', 'fashion-accessories', 'Clothing, shoes, handbags, and jewelry'),
  ('Sports & Outdoors', 'sports-outdoors', 'Sporting goods, outdoor gear, and fitness equipment'),
  ('Toys & Games', 'toys-games', 'Action figures, board games, and vintage toys'),
  ('Books & Media', 'books-media', 'Books, music, movies, and other media'),
  ('Automotive', 'automotive', 'Cars, motorcycles, parts, and accessories'),
  ('Jewelry & Watches', 'jewelry-watches', 'Fine jewelry, luxury watches, and precious stones'),
  ('Antiques', 'antiques', 'Vintage and antique items of historical significance');
END
GO
