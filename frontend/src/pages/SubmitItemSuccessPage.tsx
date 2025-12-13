import { useLocation, useParams, Link } from 'react-router-dom'

export default function SubmitItemSuccessPage() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const itemTitle = (location.state as { itemTitle?: string })?.itemTitle

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="bg-white rounded-xl border border-sage/20 p-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Item Submitted!</h1>

        {itemTitle && (
          <p className="text-gray-600 mb-4">
            "<strong>{itemTitle}</strong>" has been submitted for review.
          </p>
        )}

        <p className="text-gray-500 text-sm mb-6">
          The event organizer will review your submission. You'll be notified once it's approved.
        </p>

        <div className="space-y-3">
          <Link
            to={`/events/${slug}/submit`}
            className="block w-full py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90"
          >
            Submit Another Item
          </Link>
          <Link
            to={`/events/${slug}`}
            className="block w-full py-3 border border-sage text-sage font-semibold rounded-xl hover:bg-sage/10"
          >
            View Auction
          </Link>
        </div>
      </div>
    </div>
  )
}
