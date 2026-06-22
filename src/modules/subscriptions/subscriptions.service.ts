import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import MondaySubscription from '../../models/monday-subscription.model';
import { ModelWhereClause } from '../../common/interfaces/common.interface';
import { SubscriptionEnum } from '../../common/interfaces/subscription.interface';

type SubscriptionWhereClause = ModelWhereClause<MondaySubscription>;

@Injectable()
export class SubscriptionService {
  constructor(@InjectModel(MondaySubscription) private readonly subscriptionModel: typeof MondaySubscription) {}

  getSubscriptions = (where?: SubscriptionWhereClause): Promise<MondaySubscription[]> => {
    return this.subscriptionModel.findAll({ where });
  };

  findSubscription = async (where: SubscriptionWhereClause): Promise<MondaySubscription | null> => {
    return this.subscriptionModel.findOne({ where });
  };

  /** Count active (non–soft-deleted) FORM_SUBMISSION rows for this form. */
  countSubscriptions = async (formId: string): Promise<number> => {
    return this.subscriptionModel.count({
      where: {
        form_id: formId,
        webhook_type: SubscriptionEnum.FORM_SUBMISSION,
      },
    });
  };

  createSubscription = async (data: any): Promise<MondaySubscription> => {
    return this.subscriptionModel.create(data);
  };

  updateSubscription = async (subscription: MondaySubscription, data: Partial<MondaySubscription>): Promise<MondaySubscription> => {
    return subscription.update(data);
  };

  deleteSubscription = async (where: SubscriptionWhereClause): Promise<number> => {
    return this.subscriptionModel.destroy({ where });
  };
}
