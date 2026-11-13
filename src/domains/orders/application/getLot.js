import { DEFAULT_LOT_SLUG } from '../domain/lot';

export const getLot = (repository, slug = DEFAULT_LOT_SLUG) => repository.fetchLot(slug);
