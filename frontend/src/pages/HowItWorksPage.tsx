import { Link } from 'react-router-dom'

export default function HowItWorksPage() {
  const steps = [
    {
      number: 1,
      title: 'Browse Auctions',
      description: 'Explore our curated collection of unique items from trusted sellers.',
    },
    {
      number: 2,
      title: 'Create an Account',
      description: 'Sign up securely using your email or social media account.',
    },
    {
      number: 3,
      title: 'Place Your Bid',
      description: "Enter your maximum bid amount. We'll bid on your behalf up to that amount.",
    },
    {
      number: 4,
      title: 'Win & Pay',
      description: 'If you\'re the highest bidder when the auction ends, complete payment securely.',
    },
    {
      number: 5,
      title: 'Receive Your Item',
      description: 'Your treasure is shipped directly to you with full tracking and buyer protection.',
    },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="font-display text-4xl font-bold text-charcoal text-center mb-12">
        How It Works
      </h1>

      <div className="space-y-8">
        {steps.map((step, index) => (
          <div
            key={step.number}
            className="flex gap-6 animate-slide-up opacity-0"
            style={{ animationDelay: `${index * 150}ms`, animationFillMode: 'forwards' }}
          >
            <div className="flex-shrink-0 w-14 h-14 rounded-full bg-sage text-white 
                            flex items-center justify-center font-display text-xl font-bold">
              {step.number}
            </div>
            <div>
              <h3 className="font-display text-xl font-semibold text-charcoal mb-2">
                {step.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-12">
        <Link
          to="/"
          className="inline-block px-8 py-4 bg-sage text-white font-semibold rounded-xl 
                     hover:bg-sage-dark transition-colors shadow-lg"
        >
          Start Browsing
        </Link>
      </div>
    </div>
  )
}
