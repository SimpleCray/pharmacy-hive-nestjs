import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import SyncedFormSubmission from '../../models/synced-form-submission.model';
import { ModelWhereClause } from '../../common/interfaces/common.interface';

type SyncedFormSubmissionWhereClause = ModelWhereClause<SyncedFormSubmission>;

@Injectable()
export class SyncedFormSubmissionService {
  constructor(@InjectModel(SyncedFormSubmission) private readonly model: typeof SyncedFormSubmission) {}

  findSyncedFormSubmission = async (where: SyncedFormSubmissionWhereClause): Promise<SyncedFormSubmission | null> => {
    return this.model.findOne({ where });
  };

  createSyncedFormSubmission = async (data: {
    submissionId: string;
    monday_item_id: string;
    form_id: string;
    board_id: string;
  }): Promise<SyncedFormSubmission> => {
    return this.model.create(data as any);
  };

  updateSyncedFormSubmission = async (
    syncedFormSubmission: SyncedFormSubmission,
    data: Partial<SyncedFormSubmission>,
  ): Promise<SyncedFormSubmission> => {
    return syncedFormSubmission.update(data);
  };
}
