import { forwardRef } from "react";

// Fixed A4 portrait canvas at ~96dpi (794x1123 ≈ 210x297mm). The node is
// rasterised at this exact size and dropped full-page into the PDF, so the
// aspect ratio must stay 794:1123. Styles are inline on purpose: the poster is
// a print artifact and must always render light, never inheriting app theme.
const A4_W = 794;
const A4_H = 1123;
const AMBER = "#f59e0b";
const INK = "#0f172a";
const RED = "#dc2626";

const S = {
  page: {
    width: A4_W,
    height: A4_H,
    boxSizing: "border-box",
    background: "#ffffff",
    color: INK,
    fontFamily: "'Segoe UI', system-ui, -apple-system, Arial, sans-serif",
    display: "flex",
    flexDirection: "column",
    padding: "36px 40px",
    border: `6px solid ${INK}`,
    overflow: "hidden",
  },
  banner: {
    background: RED,
    color: "#ffffff",
    textAlign: "center",
    fontWeight: 900,
    fontSize: 68,
    letterSpacing: 4,
    lineHeight: 1.05,
    padding: "10px 0",
    borderRadius: 8,
  },
  name: {
    textAlign: "center",
    fontWeight: 800,
    fontSize: 40,
    margin: "14px 0 6px",
  },
  photoWrap: {
    width: "100%",
    height: 420,
    margin: "8px 0 14px",
    background: "#f1f5f9",
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `2px solid #e2e8f0`,
  },
  photo: { width: "100%", height: "100%", objectFit: "cover" },
  photoPlaceholder: { color: "#94a3b8", fontSize: 22 },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "6px 20px",
    fontSize: 20,
    margin: "2px 0 10px",
  },
  detailFull: { gridColumn: "1 / -1" },
  label: { fontWeight: 700, color: "#475569" },
  desc: {
    fontSize: 21,
    lineHeight: 1.4,
    margin: "4px 0 12px",
    display: "-webkit-box",
    WebkitLineClamp: 4,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  map: {
    width: "100%",
    height: 190,
    objectFit: "cover",
    borderRadius: 10,
    border: "2px solid #e2e8f0",
    margin: "2px 0 12px",
  },
  reward: {
    background: AMBER,
    color: INK,
    fontWeight: 800,
    fontSize: 26,
    textAlign: "center",
    padding: "10px 0",
    borderRadius: 8,
    margin: "2px 0 12px",
  },
  spacer: { flex: 1 },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    borderTop: `3px solid ${INK}`,
    paddingTop: 16,
  },
  contactBlock: { flex: 1 },
  contactHeading: { fontWeight: 800, fontSize: 24, marginBottom: 4 },
  contactValue: { fontSize: 28, fontWeight: 800, color: RED, wordBreak: "break-word" },
  qr: { width: 150, height: 150 },
  qrCaption: { fontSize: 13, textAlign: "center", color: "#475569", maxWidth: 160, marginTop: 4 },
  brand: { textAlign: "center", fontSize: 13, color: "#94a3b8", marginTop: 10, letterSpacing: 2 },
};

/**
 * Presentational-only missing-cat poster. All strings arrive pre-formatted and
 * localised; image props must be data URLs so the node can be rasterised
 * without tainting the canvas.
 */
const MissingPoster = forwardRef(function MissingPoster(props, ref) {
  const {
    t,
    catName,
    description,
    colorLabel,
    lastSeenLabel,
    address,
    coords,
    contact,
    photoDataUrl,
    qrDataUrl,
    mapDataUrl,
    reward,
    phone,
    answersTo,
  } = props;

  return (
    <div ref={ref} style={S.page}>
      <div style={S.banner}>{t("poster.banner")}</div>

      {catName && <div style={S.name}>{catName}</div>}

      <div style={S.photoWrap}>
        {photoDataUrl ? (
          <img src={photoDataUrl} alt={catName || "cat"} style={S.photo} />
        ) : (
          <span style={S.photoPlaceholder}>🐱</span>
        )}
      </div>

      <div style={S.detailGrid}>
        {lastSeenLabel && (
          <div style={S.detailFull}>
            <span style={S.label}>{t("poster.lastSeen")}: </span>
            {lastSeenLabel}
          </div>
        )}
        {colorLabel && (
          <div>
            <span style={S.label}>{t("poster.color")}: </span>
            {colorLabel}
          </div>
        )}
        {answersTo && (
          <div>
            <span style={S.label}>{t("poster.answersTo")}: </span>
            {answersTo}
          </div>
        )}
        {address && (
          <div style={S.detailFull}>
            <span style={S.label}>{t("poster.area")}: </span>
            {address}
          </div>
        )}
        {coords && (
          <div style={S.detailFull}>
            <span style={S.label}>{t("poster.coords")}: </span>
            {coords}
          </div>
        )}
      </div>

      {description && <div style={S.desc}>{description}</div>}

      {mapDataUrl && <img src={mapDataUrl} alt="" style={S.map} />}

      {reward && (
        <div style={S.reward}>
          {t("poster.reward")}: {reward}
        </div>
      )}

      <div style={S.spacer} />

      <div style={S.footer}>
        <div style={S.contactBlock}>
          <div style={S.contactHeading}>{t("poster.contactHeading")}</div>
          {contact && <div style={S.contactValue}>{contact}</div>}
          {phone && <div style={S.contactValue}>{phone}</div>}
        </div>
        {qrDataUrl && (
          <div style={{ textAlign: "center" }}>
            <img src={qrDataUrl} alt="QR code" style={S.qr} />
            <div style={S.qrCaption}>{t("poster.scanCaption")}</div>
          </div>
        )}
      </div>

      <div style={S.brand}>CatMap · catmap.drytrix.com</div>
    </div>
  );
});

export default MissingPoster;
