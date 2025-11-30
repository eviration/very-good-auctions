import { Link } from 'react-router-dom'

export default function HowItWorksPage() {
  const steps = [
    {
      number: 1,
      title: 'Create your organization',
      description: 'Set up your school, church, nonprofit, or community group. It takes a few minutes and there\'s no approval process to wait for.',
    },
    {
      number: 2,
      title: 'Set up an auction event',
      description: 'Pick your start and end dates, add a description, and configure your settings. You can run standard auctions or silent auctions.',
    },
    {
      number: 3,
      title: 'Collect item donations',
      description: 'Invite your community to submit items. You review each submission and decide what gets included in your auction.',
    },
    {
      number: 4,
      title: 'Go live',
      description: 'When you\'re ready, open bidding. Share your auction link and people can browse and bid from any device.',
    },
    {
      number: 5,
      title: 'Collect funds',
      description: 'Winners pay securely through the site. You receive your funds and can focus on your organization\'s mission.',
    },
  ]

  const features = [
    {
      title: 'Simple by design',
      description: 'If you can send an email, you can run an auction here. No training required.',
    },
    {
      title: 'Predictable pricing',
      description: 'A flat fee based on event size. You\'ll know the exact cost before you start. No percentages, no surprises.',
    },
    {
      title: 'Built for real groups',
      description: 'Schools, churches, PTAs, clubs. This is for organizations that need an auction, not enterprise software.',
    },
  ]

  return (
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="clay-section text-center mb-16">
          <h1 className="font-display text-4xl font-black text-charcoal mb-4">
            A straightforward way to run online auctions
          </h1>
          <p className="text-lg text-charcoal-light font-medium max-w-2xl mx-auto mb-6">
            Most fundraising tools are either overly complicated or way too expensive
            for what small organizations actually need.
          </p>
          <p className="text-lg text-charcoal-light font-medium max-w-2xl mx-auto">
            This does one thing well: helps you run an online auction to raise money
            for your group. Nothing more, nothing less.
          </p>
        </div>

        {/* Features */}
        <div className="mb-16">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className="clay-card p-6 text-center"
              >
                <h3 className="font-bold text-charcoal mb-3">{feature.title}</h3>
                <p className="text-charcoal-light text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="mb-16">
          <h2 className="font-display text-2xl font-black text-charcoal mb-8 text-center">
            How it works
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

        {/* Pricing Section */}
        <div className="clay-section bg-clay-mint/30 mb-16">
          <h2 className="font-display text-2xl font-black text-charcoal mb-4 text-center">
            Clear, simple pricing
          </h2>
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-charcoal-light mb-6">
              There's a flat fee based on how many items are in your auction.
              You see the exact amount before you commit. No percentage of your bids,
              no hidden charges, no subscription required.
            </p>
            <div className="clay-card p-6 inline-block">
              <p className="text-sm text-charcoal-light mb-2">You pay</p>
              <p className="font-display text-2xl font-black text-charcoal">A flat fee</p>
              <p className="text-sm text-charcoal-light mt-2">based on your auction size</p>
            </div>
            <p className="text-sm text-charcoal-light mt-4">
              The more you raise, the more you keep.
            </p>
          </div>
        </div>

        {/* About Section */}
        <div className="clay-card p-8 mb-16">
          <h2 className="font-display text-xl font-black text-charcoal mb-4">
            About this project
          </h2>
          <p className="text-charcoal-light mb-4">
            This isn't a venture-backed startup trying to dominate the market.
            It's a simple, affordable auction tool that exists for everyday organizations
            like schools, churches, and community groups.
          </p>
          <p className="text-charcoal-light">
            If you run into any issues or have questions, feel free to reach out.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-charcoal-light mb-6">
            Ready to get started?
          </p>
          <Link
            to="/events/create"
            className="clay-button bg-clay-mint font-bold text-lg px-8 py-4 inline-flex items-center gap-2"
          >
            Create your first auction
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
