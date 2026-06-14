import React from "react";

export default function CosmeticFx({ classes = "" }) {
  const fire = classes.includes("ap-border-fire");
  const spark = classes.includes("ap-effect-spark");
  const lightning = classes.includes("ap-effect-lightning");
  const champion = classes.includes("ap-effect-champion");
  if (!fire && !spark && !lightning && !champion) return null;

  return <div className="cosmetic-fx" aria-hidden="true">
    {spark && <div className="fx-spark-field">
      {Array.from({ length: 18 }, (_, index) => (
        <b
          key={index}
          className={`fx-spark spark-${index + 1}`}
          style={{
            "--spark-angle": `${index * 21}deg`,
            "--spark-delay": `${(index % 9) * -.13}s`,
            "--spark-size": `${5 + (index % 4) * 2}px`
          }}
        />
      ))}
      <i className="fx-shine shine-a" />
      <i className="fx-shine shine-b" />
      <i className="fx-shine shine-c" />
    </div>}
    {fire && <div className="fx-fire-field">
      <b className="fx-flame-real flame-a" />
      <b className="fx-flame-real flame-b" />
      <b className="fx-flame-real flame-c" />
      <b className="fx-flame-real flame-d" />
      <b className="fx-ember ember-a" />
      <b className="fx-ember ember-b" />
      <b className="fx-ember ember-c" />
    </div>}
    {lightning && <svg className="fx-electric-field" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline className="fx-arc arc-main" points="7,18 24,33 15,44 39,51 28,70 55,82 50,96" />
      <polyline className="fx-arc arc-side arc-one" points="82,4 62,22 74,31 49,43 65,55 42,73" />
      <polyline className="fx-arc arc-side arc-two" points="13,85 31,70 25,61 48,49 39,39 63,21" />
      <polyline className="fx-arc arc-core" points="88,20 67,37 77,47 54,57 64,68 36,91" />
    </svg>}
    {champion && <div className="fx-champion-field">
      <b className="fx-star-real star-a" />
      <b className="fx-star-real star-b" />
      <b className="fx-star-real star-c" />
    </div>}
  </div>;
}
