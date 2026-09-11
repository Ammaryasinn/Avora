import {
  BoxIcon,
  ChartIcon,
  MegaphoneIcon,
  MessageIcon,
  SparklesIcon,
} from "@/components/ui/icons";

const steps = [
  {
    title: "Catalogue",
    description: "Add your products or properties",
    icon: BoxIcon,
    tone: "sand",
  },
  {
    title: "AI Creative",
    description: "Generate scroll-stopping images, copy and videos",
    icon: SparklesIcon,
    tone: "lilac",
  },
  {
    title: "Campaign",
    description: "Launch ads on Meta (Instagram & Facebook)",
    icon: MegaphoneIcon,
    tone: "rose",
  },
  {
    title: "Conversation",
    description: "AI handles replies, qualifies leads, and follows up",
    icon: MessageIcon,
    tone: "green",
  },
  {
    title: "Revenue",
    description: "Track sales, measure ROI, and grow",
    icon: ChartIcon,
    tone: "gold",
  },
] as const;

export function AvoraFlow() {
  return (
    <section id="avora-flow" className="avora-flow-section" aria-labelledby="avora-flow-title">
      <div className="flow-heading">
        <span className="marketing-badge"><i /> The Avora Flow</span>
        <h2 id="avora-flow-title">From products to profit — all in one flow.</h2>
        <p>A simple, powerful process to help you market, sell, and grow.</p>
      </div>

      <div className="flow-grid">
        <div className="flow-line" aria-hidden="true"><span /></div>
        {steps.map(({ title, description, icon: Icon, tone }, index) => (
          <article key={title} className="flow-card">
            <span className={`flow-icon flow-icon-${tone}`}>
              <Icon className="size-6" />
            </span>
            <span className="flow-step-number">0{index + 1}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
