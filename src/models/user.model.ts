import { Column, DataType, Model, PrimaryKey, Default, Table } from 'sequelize-typescript';

@Table({
  tableName: 'Users',
  paranoid: true, // soft deletes
  timestamps: true, // createdAt / updatedAt
})
export default class User extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, allowNull: false })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare monday_account_id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare monday_user_id: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare monday_access_token: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare hq_token: string | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare readonly deletedAt: Date | null;
}
