/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SyncedFormSubmissions', {
      id: {
        allowNull: false,
        autoIncrement: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      submissionId: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      monday_item_id: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      form_id: {
        allowNull: false,
        type: Sequelize.STRING,
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

    await queryInterface.addIndex('SyncedFormSubmissions', ['submissionId', 'form_id'], {
      unique: true,
      name: 'synced_form_submissions_submission_form_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SyncedFormSubmissions');
  },
};
