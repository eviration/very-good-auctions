import { Link } from 'react-router-dom'

export default function HowItWorksPage() {
  const steps = [
    {
      number: 1,
      title: 'Create Your Organization',
      description: 'Set up your nonprofit, school, or community group in minutes. No lengthy approval process or hidden requirements.',
    },
    {
      number: 2,
      title: 'Launch an Auction Event',
      description: 'Create your auction with a few clicks. Set your dates, add a description, and you\'re ready to start collecting items.',
    },
    {
      number: 3,
      title: 'Collect Donations',
      description: 'Invite your community to submit items. Review and approve submissions at your own pace.',
    },
    {
      number: 4,
      title: 'Go Live',
      description: 'When you\'re ready, open bidding. Share your auction link and watch your community come together.',
    },
    {
      number: 5,
      title: 'Collect & Celebrate',
      description: 'Winners pay securely through the platform. You receive your funds and focus on what matters: your mission.',
    },
  ]

  const principles = [
    {
      title: 'Simple, Not Sophisticated',
      description: 'Online auctions shouldn\'t require a consultant. We built the basics right, so you can focus on your cause.',
    },
    {
      title: 'Transparent Pricing',
      description: 'A small platform fee on winning bids. That\'s it. No subscription tiers, no premium features, no surprise charges.',
    },
    {
      title: 'Built for Real Organizations',
      description: 'Not every fundraiser needs enterprise features. Sometimes you just need an auction that works.',
    },
  ]

  return (
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="clay-section text-center mb-16">
          <h1 className="font-display text-4xl font-black text-charcoal mb-4">
            Fundraising Should Be Easy
          </h1>
          <p className="text-lg text-charcoal-light font-medium max-w-2xl mx-auto">
            Online auctions are no longer cutting-edge technology. They're basic functionality
            that should be accessible, affordable, and fun for any organization that wants to
            raise funds for their community.
          </p>
        </div>

        {/* Our Philosophy */}
        <div className="mb-16">
          <h2 className="font-display text-2xl font-black text-charcoal mb-8 text-center">
            Our Philosophy
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {principles.map((principle, index) => (
              <div
                key={index}
                className="clay-card p-6 text-center"
              >
                <h3 className="font-bold text-charcoal mb-3">{principle.title}</h3>
                <p className="text-charcoal-light text-sm">{principle.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="mb-16">
          <h2 className="font-display text-2xl font-black text-charcoal mb-8 text-center">
            How It Works
          </h2>
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="clay-card p-6 flex gap-6 items-start animate-slide-up opacity-0"
                style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-clay bg-clay-mint shadow-clay
                                flex items-center justify-center font-display text-xl font-black text-charcoal">
                  {step.number}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-charcoal mb-1">
                    {step.title}
                  </h3>
                  <p className="text-charcoal-light">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* No Hidden Fees Section */}
        <div className="clay-section bg-clay-mint/30 mb-16">
          <h2 className="font-display text-2xl font-black text-charcoal mb-4 text-center">
            No Surprises. Ever.
          </h2>
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-charcoal-light mb-6">
              We believe fundraising platforms shouldn't nickel-and-dime the organizations
              trying to do good in the world. There are no premium tiers, no feature gates,
              no upsells. Every organization gets the same full-featured platform.
            </p>
            <div className="clay-card p-6 inline-block">
              <p className="text-sm text-charcoal-light mb-2">Platform fee</p>
              <p className="font-display text-3xl font-black text-charcoal">5%</p>
              <p className="text-sm text-charcoal-light mt-2">on winning bids only</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-charcoal-light mb-6">
            Ready to host your next fundraiser?
          </p>
          <Link
            to="/events/create"
            className="clay-button bg-clay-mint font-bold text-lg px-8 py-4 inline-flex items-center gap-2"
          >
            Create Your First Auction
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
