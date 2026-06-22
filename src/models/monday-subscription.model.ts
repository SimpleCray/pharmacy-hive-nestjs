import { Column, DataType, Model, PrimaryKey, Default, Table } from 'sequelize-typescript';

@Table({
  tableName: 'MondaySubscriptions',
  paranoid: true, // soft deletes
  timestamps: true, // createdAt / updatedAt
})
export default class MondaySubscription extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, allowNull: false })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare monday_user_id: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare webhook_url: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare subscription_id: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare webhook_type: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare form_id: string | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare readonly deletedAt: Date | null;
}
