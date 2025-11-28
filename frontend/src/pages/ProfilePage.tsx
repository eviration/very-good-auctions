import { useAuthStore } from '../hooks/useAuthStore'

export default function ProfilePage() {
  const { user } = useAuthStore()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-charcoal mb-8">Profile</h1>

      <div className="bg-warm-white rounded-2xl p-8 border border-gray-200">
        <div className="flex items-center gap-6 mb-8">
          <div className="w-20 h-20 rounded-full bg-sage flex items-center justify-center text-white text-3xl font-bold">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold text-charcoal">{user?.name}</h2>
            <p className="text-gray-500">{user?.email}</p>
          </div>
        </div>

        <form className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">Display Name</label>
            <input
              type="text"
              defaultValue={user?.name}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">Email</label>
            <input
              type="email"
              defaultValue={user?.email}
              disabled
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">Phone</label>
            <input
              type="tel"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">Address</label>
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
