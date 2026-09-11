const demoBrands = [
  { name: "ZURI", descriptor: "BOUTIQUE" },
  { name: "NOVA", descriptor: "HOMES" },
  { name: "élan", descriptor: "FASHION" },
  { name: "RIFT", descriptor: "PROPERTIES" },
] as const;

export function TrustStrip() {
  return (
    <section id="solutions" className="marketing-trust-strip" aria-label="Illustrative customer showcase">
      <div className="trust-intro">
        <span>Trusted by ambitious businesses</span>
        <small>Demo showcase</small>
      </div>

      <div className="trust-brands" aria-label="Fictional example brands">
        {demoBrands.map((brand, index) => (
          <div key={brand.name} className={`demo-brand demo-brand-${index + 1}`}>
            <strong>{brand.name}</strong>
            <small>{brand.descriptor}</small>
          </div>
        ))}
      </div>

      <blockquote className="trust-quote">
        <p>“Avora helped us turn our catalogue into real sales. Our WhatsApp never sleeps now.”</p>
        <footer>— Boutique Owner, Nairobi <span>· Demo testimonial</span></footer>
      </blockquote>
    </section>
  );
}
