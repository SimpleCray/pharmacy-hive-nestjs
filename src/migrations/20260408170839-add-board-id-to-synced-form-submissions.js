/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('SyncedFormSubmissions', 'board_id', {
      allowNull: false,
      type: Sequelize.STRING,
      defaultValue: '',
    });

    await queryInterface.removeIndex('SyncedFormSubmissions', 'synced_form_submissions_submission_form_unique');

    await queryInterface.addIndex('SyncedFormSubmissions', ['submissionId', 'form_id', 'board_id'], {
      unique: true,
      name: 'synced_form_submissions_submission_form_board_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('SyncedFormSubmissions', 'synced_form_submissions_submission_form_board_unique');

    await queryInterface.addIndex('SyncedFormSubmissions', ['submissionId', 'form_id'], {
      unique: true,
      name: 'synced_form_submissions_submission_form_unique',
    });

    await queryInterface.removeColumn('SyncedFormSubmissions', 'board_id');
  },
};
