import type { AppDataFile } from '@nebenkosten/schema'
import type { WorkflowSelection } from '../../WorkflowRoute'

export interface WorkflowSubRouteProps {
  readonly data: AppDataFile
  readonly selection: WorkflowSelection
  readonly onSelectionChange: (patch: Partial<WorkflowSelection>) => void
  readonly onApply: (transform: (data: AppDataFile) => AppDataFile) => boolean
}
