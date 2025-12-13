import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-white text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-sage flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <span className="font-display text-xl font-semibold">
                Very Good Auctions
              </span>
            </div>
            <p className="text-gray-400 leading-relaxed">
              Your trusted marketplace for unique treasures and collectibles.
            </p>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/help" className="text-gray-400 hover:text-white transition-colors">
                  Help Center
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="text-gray-400 hover:text-white transition-colors">
                  Bidding Guide
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-gray-400 hover:text-white transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/terms" className="text-gray-400 hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-gray-400 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/data-deletion" className="text-gray-400 hover:text-white transition-colors">
                  Data Deletion
                </Link>
              </li>
            </ul>
          </div>

          {/* Payment Methods */}
          <div>
            <h4 className="font-semibold mb-4">Payment Methods</h4>
            <div className="flex flex-wrap gap-2">
              {/* Visa */}
              <div className="bg-white rounded px-2 py-1">
                <svg className="h-6 w-10" viewBox="0 0 48 32">
                  <rect width="48" height="32" rx="4" fill="#1A1F71"/>
                  <path fill="#FFFFFF" d="M19.5 21h-3l1.9-11.5h3L19.5 21zM15 9.5l-2.8 8-0.3-1.5-1-5c-0.2-0.7-0.7-0.9-1.4-1H5.1l0 0.2c1.1 0.3 2.1 0.7 3 1.2l2.5 9.5h3.1l4.7-11.4H15z"/>
                </svg>
              </div>
              {/* Mastercard */}
              <div className="bg-white rounded px-2 py-1">
                <svg className="h-6 w-10" viewBox="0 0 48 32">
                  <rect width="48" height="32" rx="4" fill="#000000"/>
                  <circle cx="18" cy="16" r="9" fill="#EB001B"/>
                  <circle cx="30" cy="16" r="9" fill="#F79E1B"/>
                </svg>
              </div>
              {/* PayPal */}
              <div className="bg-white rounded px-2 py-1">
                <svg className="h-6 w-10" viewBox="0 0 48 32">
                  <rect width="48" height="32" rx="4" fill="#003087"/>
                  <path fill="#FFFFFF" d="M20 8h-6c-0.4 0-0.8 0.3-0.9 0.7l-2.4 15c0 0.3 0.2 0.5 0.5 0.5h2.9c0.4 0 0.8-0.3 0.9-0.7l0.7-4.2c0-0.4 0.4-0.7 0.9-0.7h2c3.3 0 5.3-1.6 5.8-4.8 0.2-1.4 0-2.5-0.6-3.3-0.7-0.9-2-1.5-3.9-1.5z"/>
                </svg>
              </div>
              {/* Apple Pay */}
              <div className="bg-white rounded px-2 py-1">
                <svg className="h-6 w-10" viewBox="0 0 48 32">
                  <rect width="48" height="32" rx="4" fill="#000000"/>
                  <path fill="#FFFFFF" d="M14.5 11c-0.5 0.6-1.3 1.1-2.1 1-0.1-0.8 0.3-1.7 0.7-2.2 0.5-0.6 1.4-1 2-1 0.1 0.9-0.2 1.7-0.6 2.2z"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-700 text-center text-gray-400">
          <p>© {new Date().getFullYear()} Very Good Auctions. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
