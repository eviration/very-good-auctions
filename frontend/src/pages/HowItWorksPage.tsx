import { Link } from 'react-router-dom'

export default function HowItWorksPage() {
  const steps = [
    {
      number: 1,
      title: 'Set up your group',
      description: 'Add your school, church, club, or nonprofit. It takes about two minutes. No paperwork.',
    },
    {
      number: 2,
      title: 'Create an auction',
      description: 'Pick your dates and write a short description. That\'s really all you need to get started.',
    },
    {
      number: 3,
      title: 'Gather items',
      description: 'People in your community can submit items to donate. You decide what gets included.',
    },
    {
      number: 4,
      title: 'Open for bidding',
      description: 'Share the link with your community. People can browse and bid from their phones or computers.',
    },
    {
      number: 5,
      title: 'Collect the money',
      description: 'Winners pay through the site. The money goes to your organization. That\'s it.',
    },
  ]

  return (
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-3xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="clay-section text-center mb-16">
          <h1 className="font-display text-4xl font-black text-charcoal mb-4">
            Hi, I'm glad you're here
          </h1>
          <p className="text-lg text-charcoal-light font-medium max-w-2xl mx-auto mb-6">
            I built this because I kept seeing schools and small organizations
            struggle with complicated fundraising software, or pay way too much
            for features they didn't need.
          </p>
          <p className="text-lg text-charcoal-light font-medium max-w-2xl mx-auto">
            This is just a simple auction tool. It does one thing: helps you run
            an online auction to raise money for your group. If you can send an email,
            you can use this.
          </p>
        </div>

        {/* Steps */}
        <div className="mb-16">
          <h2 className="font-display text-2xl font-black text-charcoal mb-8 text-center">
            Here's how it works
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
            What it costs
          </h2>
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-charcoal-light mb-6">
              There's a small flat fee based on how many items are in your auction.
              You'll see the exact amount before you start. No surprises, no percentages,
              no hidden charges.
            </p>
            <p className="text-charcoal-light mb-6">
              I charge enough to keep the site running. That's it. I'm not trying to
              build a billion-dollar company here.
            </p>
            <div className="clay-card p-6 inline-block">
              <p className="text-sm text-charcoal-light mb-2">You pay</p>
              <p className="font-display text-2xl font-black text-charcoal">A flat fee</p>
              <p className="text-sm text-charcoal-light mt-2">based on your auction size</p>
            </div>
            <p className="text-sm text-charcoal-light mt-4">
              The more you raise, the more you keep. Simple as that.
            </p>
          </div>
        </div>

        {/* About Section */}
        <div className="clay-card p-8 mb-16">
          <h2 className="font-display text-xl font-black text-charcoal mb-4">
            A note from me
          </h2>
          <p className="text-charcoal-light mb-4">
            I'm just one person. I'm not a company with investors expecting huge returns.
            I built this in my spare time because I thought it should exist.
          </p>
          <p className="text-charcoal-light mb-4">
            If something doesn't work right, or you're confused about anything,
            just reach out. I'll do my best to help.
          </p>
          <p className="text-charcoal-light">
            Thanks for giving this a try.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-charcoal-light mb-6">
            Ready to try it out?
          </p>
          <Link
            to="/events/create"
            className="clay-button bg-clay-mint font-bold text-lg px-8 py-4 inline-flex items-center gap-2"
          >
            Create an auction
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
