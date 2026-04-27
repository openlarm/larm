import { SourceDeps, SourceResult } from '@openlarm/ingest-types';

declare function runCwaAws(deps: SourceDeps): Promise<SourceResult>;

export { runCwaAws };
