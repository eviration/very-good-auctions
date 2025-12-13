import { Link } from 'react-router-dom'
import { useAuthStore } from '../hooks/useAuthStore'

export default function ProfilePage() {
  const { user } = useAuthStore()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-white mb-8">Profile</h1>

      {/* Settings Links */}
      <div className="bg-warm-white rounded-2xl p-6 border border-gray-200 mb-6">
        <h2 className="font-semibold text-white mb-4">Settings</h2>
        <div className="space-y-2">
          <Link
            to="/tax-information"
            className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-white">Tax Information</p>
                <p className="text-sm text-gray-500">Manage W-9 and tax documents</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400 group-hover:text-sage transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      <div className="bg-warm-white rounded-2xl p-8 border border-gray-200">
        <div className="flex items-center gap-6 mb-8">
          <div className="w-20 h-20 rounded-full bg-sage flex items-center justify-center text-white text-3xl font-bold">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">{user?.name}</h2>
            <p className="text-gray-500">{user?.email}</p>
          </div>
        </div>

        <form className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Display Name</label>
            <input
              type="text"
              defaultValue={user?.name}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Email</label>
            <input
              type="email"
              defaultValue={user?.email}
              disabled
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Phone</label>
            <input
              type="tel"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Address</label>
            <textarea
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              placeholder="Enter your shipping address"
            />
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors"
          >
            Save Changes
          </button>
        </form>
      </div>
    </div>
  )
}
