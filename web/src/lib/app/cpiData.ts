// The bundled CPI-U series (refreshed from FRED by the scheduled update-cpi workflow),
// with missing months filled in as load_cpi_data does.
import raw from '../data/cpi_u_historical.json';
import { interpolateMissingMonths } from '../engine/cpi';

export const cpiSeries: Record<string, number> = interpolateMissingMonths(raw as Record<string, number | null>);
