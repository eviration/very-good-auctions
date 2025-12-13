import { Link } from 'react-router-dom'

export default function HowItWorksPage() {
  const steps = [
    {
      number: 1,
      title: 'Create your organization',
      description: 'Set up your school, church, nonprofit, or community group in minutes. No approval process, no waiting.',
    },
    {
      number: 2,
      title: 'Choose your auction style',
      description: 'Run a standard auction with live bidding, a silent auction where bids are hidden, or a private invite-only event.',
    },
    {
      number: 3,
      title: 'Collect items from your community',
      description: 'Invite supporters to submit items for your auction. You review and approve what gets included.',
    },
    {
      number: 4,
      title: 'Open bidding',
      description: 'Share your auction link. People browse and bid from any device. You focus on spreading the word.',
    },
    {
      number: 5,
      title: 'Get your funds',
      description: 'Winners pay through the platform. Money goes directly to your organization. Simple as that.',
    },
  ]

  const auctionTypes = [
    {
      title: 'Standard Auction',
      description: 'Traditional bidding where everyone sees current bids. Creates excitement as people compete.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
      ),
    },
    {
      title: 'Silent Auction',
      description: 'Bids are hidden from other bidders. Great for galas and in-person events with an online component.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: 'Private Auction',
      description: 'Invite-only events for your inner circle. Share a link or QR code. Perfect for member-exclusive fundraising.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
  ]

  const features = [
    {
      title: 'Simple by design',
      description: 'If you can send an email, you can run an auction. No training manuals, no complicated setup.',
    },
    {
      title: 'Keep more of what you raise',
      description: 'Low, transparent fees. No percentages of your hard-earned donations. What you raise is yours.',
    },
    {
      title: 'Built for real organizations',
      description: 'Schools, churches, PTAs, clubs. Made for groups that need results, not enterprise features.',
    },
  ]

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="glass-section text-center mb-16">
          <h1 className="font-display text-4xl font-black text-white mb-4">
            Online auctions, simplified
          </h1>
          <p className="text-lg text-white/80 font-medium max-w-2xl mx-auto mb-6">
            Most fundraising platforms are overbuilt and overpriced. We built something different.
          </p>
          <p className="text-lg text-white/80 font-medium max-w-2xl mx-auto">
            One tool that helps you run online auctions and raise money for your group.
            Easy to use. Easy to afford.
          </p>
        </div>

        {/* Core Value Props */}
        <div className="mb-16">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className="glass-section p-6 text-center"
              >
                <h3 className="font-bold text-white mb-3">{feature.title}</h3>
                <p className="text-white/80 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Auction Types */}
        <div className="mb-16">
          <h2 className="font-display text-2xl font-black text-white mb-2 text-center">
            Pick the right format for your event
          </h2>
          <p className="text-white/80 text-center mb-8 max-w-xl mx-auto">
            Different events call for different approaches. Choose what works for you.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {auctionTypes.map((type, index) => (
              <div
                key={index}
                className="glass-section p-6"
              >
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white mb-4">
                  {type.icon}
                </div>
                <h3 className="font-bold text-white mb-2">{type.title}</h3>
                <p className="text-white/80 text-sm">{type.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="mb-16">
          <h2 className="font-display text-2xl font-black text-white mb-8 text-center">
            How it works
          </h2>
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="glass-section p-6 flex gap-6 items-start animate-slide-up opacity-0"
                style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-sage/30 border border-sage/40
                                flex items-center justify-center font-display text-xl font-black text-sage">
                  {step.number}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white mb-1">
                    {step.title}
                  </h3>
                  <p className="text-white/80">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Section */}
        <div className="glass-section bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10 mb-16">
          <h2 className="font-display text-2xl font-black text-white mb-4 text-center">
            Pricing that makes sense
          </h2>
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-white/80 mb-8">
              We believe in straightforward pricing. Choose the option that fits your organization.
            </p>

            <div className="grid gap-6 md:grid-cols-2 mb-8">
              <div className="glass-section p-6">
                <div className="text-sm text-white/70 mb-2">Integrated Payments</div>
                <div className="font-display text-xl font-black text-white mb-2">5% of funds raised</div>
                <p className="text-sm text-white/80">
                  We handle all payment processing. Winners pay through the platform, you receive the funds.
                  Simple and hands-off.
                </p>
              </div>

              <div className="glass-section p-6">
                <div className="text-sm text-white/70 mb-2">Self-Managed Payments</div>
                <div className="font-display text-xl font-black text-white mb-2">$0</div>
                <p className="text-sm text-white/80">
                  Handle payments your own way. Use the platform for bidding, collect payments directly
                  from winners yourself.
                </p>
              </div>
            </div>

            <p className="text-sm text-white/80">
              No hidden fees. No monthly subscriptions. No percentages you don't see coming.
            </p>
          </div>
        </div>

        {/* About Section */}
        <div className="glass-section p-8 mb-16">
          <h2 className="font-display text-xl font-black text-white mb-4">
            Why we built this
          </h2>
          <p className="text-white/80 mb-4">
            We've seen schools and churches struggle with auction software that costs too much
            and does too little. Big platforms want enterprise contracts. DIY solutions are
            a nightmare to manage.
          </p>
          <p className="text-white/80">
            So we built something in between: a tool that's genuinely easy to use,
            doesn't take a huge cut of your fundraising, and just works.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-white/80 mb-6">
            Ready to get started?
          </p>
          <Link
            to="/events/create"
            className="glass-button font-bold text-lg px-8 py-4 inline-flex items-center gap-2"
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
