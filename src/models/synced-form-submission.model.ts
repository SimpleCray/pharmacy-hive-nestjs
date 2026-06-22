import { Column, DataType, Model, PrimaryKey, Default, Table } from 'sequelize-typescript';

@Table({
  tableName: 'SyncedFormSubmissions',
  paranoid: true,
  timestamps: true,
})
export default class SyncedFormSubmission extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, allowNull: false })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare submissionId: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare monday_item_id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare form_id: string;

  @Default('')
  @Column({ type: DataType.STRING, allowNull: false })
  declare board_id: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare readonly deletedAt: Date | null;
}
