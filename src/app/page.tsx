import Link from "next/link";

import { AvoraFlow } from "@/components/marketing/avora-flow";
import { HeroProductPreview } from "@/components/marketing/hero-product-preview";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Container } from "@/components/ui/container";
import { ArrowRightIcon } from "@/components/ui/icons";

export default function Home() {
  return (
    <div className="marketing-page min-h-screen overflow-hidden text-foreground">
      <div className="marketing-atmosphere" aria-hidden="true" />
      <SiteHeader />

      <main className="relative">
        <Container className="relative grid items-start gap-10 pb-12 pt-8 lg:grid-cols-[0.98fr_1.02fr] lg:gap-2 lg:pb-8 lg:pt-4 xl:grid-cols-[0.96fr_1.04fr]">
          <section className="relative z-10 py-6 lg:py-2" aria-labelledby="home-heading">
            <span className="marketing-badge">
              <i /> AI Marketing for African Businesses
            </span>

            <h1 id="home-heading" className="marketing-display mt-6">
              <span>Turn your products</span>
              <span>into campaigns,</span>
              <span>conversations, and</span>
              <span>revenue.</span>
            </h1>

            <p className="marketing-lede mt-6 max-w-xl">
              Avora brings your catalogue, AI creative tools, advertising,
              WhatsApp sales, and revenue tracking into one system — built for
              African SMEs.
            </p>

            <div id="get-started" className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/sign-up" className="marketing-primary-button group px-6 py-3.5">
                Start with Avora
                <ArrowRightIcon className="size-4 transition group-hover:translate-x-1" />
              </Link>
              <a href="#avora-flow" className="marketing-secondary-button group px-6 py-3.5">
                <span className="play-button" aria-hidden="true">▶</span>
                See how it works
              </a>
            </div>

            <div className="hero-trust-note">
              <div className="hero-trust-avatars" aria-hidden="true">
                <span>Z</span><span>N</span><span>E</span><span>+</span>
              </div>
              <p>Trusted by growing businesses across Kenya</p>
            </div>
          </section>

          <section className="relative min-w-0" aria-label="Avora product experience illustration">
            <HeroProductPreview />
          </section>
        </Container>

        <Container className="pb-5 lg:pb-7">
          <TrustStrip />
        </Container>

        <div className="px-3 pb-8 sm:px-5 lg:px-6">
          <AvoraFlow />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
