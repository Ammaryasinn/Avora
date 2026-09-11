import { AvoraLogo } from "@/components/ui/avora-logo";
import {
  BoxIcon,
  ChartIcon,
  GridIcon,
  MegaphoneIcon,
  MessageIcon,
  SettingsIcon,
  SparklesIcon,
  UsersIcon,
} from "@/components/ui/icons";

const navigation = [
  { label: "Dashboard", icon: GridIcon, active: true },
  { label: "Catalogue", icon: BoxIcon, active: false },
  { label: "AI Creative", icon: SparklesIcon, active: false },
  { label: "Campaigns", icon: MegaphoneIcon, active: false },
  { label: "Conversations", icon: MessageIcon, active: false },
  { label: "Leads", icon: UsersIcon, active: false },
  { label: "Analytics", icon: ChartIcon, active: false },
  { label: "Settings", icon: SettingsIcon, active: false },
] as const;

const metrics = [
  { label: "Sales", value: "KES 285,400", change: "+12%", tone: "sand" },
  { label: "Leads", value: "1,248", change: "+28%", tone: "green" },
  { label: "ROAS", value: "4.7x", change: "+18%", tone: "lilac" },
] as const;

const products = [
  { name: "Linen Dress", detail: "142 sales", tone: "latte" },
  { name: "Oversized Blazer", detail: "96 sales", tone: "espresso" },
  { name: "Silk Set", detail: "84 sales", tone: "stone" },
  { name: "Wide Leg Pants", detail: "71 sales", tone: "clay" },
] as const;

const chartBars = [34, 57, 48, 72, 46, 62, 41, 53, 38, 66, 51, 44, 59, 36] as const;

function ProductArtwork({ tone = "latte" }: { tone?: string }) {
  return (
    <svg
      viewBox="0 0 72 88"
      role="img"
      aria-label="Neutral fashion product illustration"
      className={`product-artwork product-artwork-${tone}`}
    >
      <path
        d="M27 10 18 18l7 16-8 44h38l-8-44 7-16-9-8-6 8h-6l-6-8Z"
        fill="currentColor"
      />
      <path d="M29 22h14l3 12H26l3-12Z" fill="white" opacity="0.2" />
      <path d="M26 35h20" stroke="white" strokeOpacity="0.26" />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  change,
  tone,
}: (typeof metrics)[number]) {
  return (
    <div className="dashboard-metric-card">
      <span className={`dashboard-metric-icon dashboard-metric-icon-${tone}`}>
        {label === "Sales" ? "◫" : label === "Leads" ? "♧" : "▣"}
      </span>
      <p>{label}</p>
      <strong>{value}</strong>
      <span className="dashboard-positive">↑ {change} from last week</span>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="hero-dashboard" aria-label="Illustrative Avora dashboard preview">
      <div className="dashboard-browser-bar" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="dashboard-body">
        <aside className="dashboard-sidebar">
          <AvoraLogo wordmarkClassName="text-sm" />
          <div className="dashboard-navigation">
            {navigation.map(({ label, icon: Icon, active }) => (
              <div
                key={label}
                className={active ? "dashboard-nav-item is-active" : "dashboard-nav-item"}
              >
                <Icon className="size-3.5" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="dashboard-content">
          <div className="dashboard-search">⌕&nbsp;&nbsp; Search anything...</div>
          <div className="dashboard-heading">
            <h2>Good morning 👋</h2>
            <p>Here&apos;s what&apos;s happening with your store today.</p>
          </div>

          <div className="dashboard-metrics">
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>

          <div className="dashboard-lower-grid">
            <section className="dashboard-chart-card">
              <div className="dashboard-card-heading">
                <strong>Revenue</strong>
                <span><i className="legend-current" /> This week</span>
                <span><i /> Last week</span>
              </div>
              <div className="dashboard-chart">
                <div className="chart-tooltip">KES 48,200<small>Tue, Sep 10</small></div>
                {chartBars.map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className={index % 2 === 0 ? "chart-bar current" : "chart-bar"}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <div className="chart-labels">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
            </section>

            <section className="dashboard-products-card">
              <strong>Top Products</strong>
              <div className="dashboard-products-list">
                {products.map((product) => (
                  <div key={product.name} className="dashboard-product-row">
                    <ProductArtwork tone={product.tone} />
                    <span><b>{product.name}</b><small>{product.detail}</small></span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
      <span className="dashboard-demo-label">Illustrative workspace preview</span>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="hero-phone" aria-label="Illustrative boutique conversation preview">
      <div className="phone-hardware">
        <div className="phone-island" />
        <div className="phone-status"><span>9:41</span><span>▮ ◕</span></div>
        <div className="phone-contact">
          <span className="phone-back">‹</span>
          <span className="phone-avatar">Z</span>
          <span><strong>Zuri Boutique</strong><small>Online</small></span>
          <span className="phone-call">⌕</span>
        </div>
        <div className="phone-chat">
          <div className="chat-bubble chat-customer">
            Hi! Is this dress still available?
            <small>10:24 ✓✓</small>
          </div>
          <div className="chat-bubble chat-avora">
            Yes! It&apos;s available in size M. Would you like to see more photos or place an order?
            <small>10:25</small>
          </div>
          <div className="phone-product-card">
            <ProductArtwork tone="latte" />
            <span>Linen Midi Dress<small>KES 4,800</small></span>
          </div>
          <div className="chat-bubble chat-customer chat-short">
            Looks amazing!
            <small>10:26 ✓✓</small>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroProductPreview() {
  return (
    <div id="product" className="hero-product-preview">
      <div className="hero-ai-callout">
        <span><SparklesIcon className="size-4" /></span>
        <p>AI that responds,<br />converts, and never sleeps.</p>
      </div>
      <DashboardMockup />
      <PhoneMockup />
      <p className="hero-handwritten-note" aria-hidden="true">
        More sales.<br />Happier customers.<br />A bigger tomorrow.
      </p>
    </div>
  );
}
