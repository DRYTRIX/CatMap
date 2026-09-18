/** Re-export hearts under the old favorites path for gradual migration. */
export {
  getFavorites,
  isFavorite,
  onFavoritesChanged,
  removeFavorite,
  toggleFavorite,
  migrateFavoritesToHearts,
  syncHeartsFromServer,
  isHearted,
} from "./hearts";
