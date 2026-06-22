/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('MondaySubscriptions', {
      id: {
        allowNull: false,
        autoIncrement: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      monday_user_id: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      webhook_url: {
        allowNull: true,
        type: Sequelize.TEXT,
      },
      subscription_id: {
        allowNull: true,
        type: Sequelize.TEXT,
      },
      webhook_type: {
        allowNull: true,
        type: Sequelize.TEXT,
      },
      form_id: {
        allowNull: true,
        type: Sequelize.TEXT,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      deletedAt: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('MondaySubscriptions');
  },
};
