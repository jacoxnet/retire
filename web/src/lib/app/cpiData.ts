// The bundled CPI-U series (core/data/cpi_u_historical.json until phase 7 moves it),
// with missing months filled in as load_cpi_data does.
import raw from '../../../../core/data/cpi_u_historical.json';
import { interpolateMissingMonths } from '../engine/cpi';

export const cpiSeries: Record<string, number> = interpolateMissingMonths(raw as Record<string, number | null>);
