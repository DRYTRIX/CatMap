import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { assetUrl } from "../api";
import { track } from "../analytics";

/** Main photo (opens the lightbox) plus the thumbnail strip for multi-photo sightings. */
export default function SightingPhotos({
  data,
  mine,
  busy,
  activePhoto,
  imgLoaded,
  onSelectPhoto,
  onImgLoad,
  onExpand,
  onDeletePhoto,
}) {
  const { t } = useTranslation();
  return (
    <>
      <button
        className="card-img-btn detail-img-btn"
        onClick={() => {
          track("sighting_photo_expand");
          onExpand();
        }}
        aria-label={t("sighting.viewFullPhoto")}
      >
        <img
          className={`card-img detail-img ${imgLoaded ? "is-loaded" : ""}`}
          src={assetUrl(data.photos[activePhoto]?.thumbnail_url ?? data.thumbnail_url)}
          alt={t("common.catSighting")}
          onLoad={() => onImgLoad()}
        />
        <span className="card-img-zoom" aria-hidden="true">⛶</span>
      </button>

      {data.photos.length > 1 && (
        <div className="photo-thumbs" role="list">
          {data.photos.map((p, i) => (
            <div key={p.id} className={`photo-thumb-wrap ${i === activePhoto ? "is-active" : ""}`}>
              <button
                type="button"
                role="listitem"
                className={`photo-thumb ${i === activePhoto ? "is-active" : ""}`}
                aria-label={t("sighting.photoOf", { index: i + 1, total: data.photos.length })}
                aria-current={i === activePhoto}
                onClick={() => {
                  onSelectPhoto(i);
                }}
              >
                <img src={assetUrl(p.thumbnail_url)} alt="" loading="lazy" />
              </button>
              {mine && p.id !== "primary" && (
                <button
                  type="button"
                  className="photo-thumb-delete"
                  aria-label={t("sighting.deletePhoto")}
                  onClick={() => onDeletePhoto(p.id)}
                  disabled={busy}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
