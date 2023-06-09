//boiler plate for an express post request
import express from 'express';
import { param, query } from 'express-validator';
import JSZip from 'jszip';
import { Types } from 'mongoose';
import Pako from 'pako';
import { BackupModel } from '../../../models/backup.js';
import { CronJob } from '../../../models/cron-job.js';
import {
  EnumAvailableCompression,
  IData,
} from '../../../services/backup/class.backupmanager.js';
import { declareEnvs } from '../../../services/service.utils.js';
import { validateRequest } from '../../../services/validation/service.validate-request.js';

const router = express.Router();

const { API_KEY } = declareEnvs(['API_KEY']);

router.get(
  '/:id',
  param('id').isMongoId().withMessage('id must be a valid mongo id'),
  query('apiKey')
    .custom((v) => v === API_KEY)
    .withMessage('not authorized'),
  validateRequest,
  async (req, res) => {
    const { id } = req.params;

    const backup = await BackupModel.findById(new Types.ObjectId(id)).populate(
      'cronJob databases'
    );

    if (!backup) {
      return res.status(404).send({ error: 'backup not found' });
    }

    //create a file name with the alias of the cron job and the date timestamp of the backup
    const fileName = _clean(
      `${
        (backup.cronJob as unknown as CronJob).alias
      }_${backup.createdAt.valueOf()}`
    );

    if (backup.compression === EnumAvailableCompression.GZIP) {
      //convert the Unit8Array to JSON and overwrite backup.data
      backup.data = Pako.ungzip((backup.data as unknown as any).buffer, {
        to: 'string',
      });
    }

    //if the backup is not compressed, create a json file for each key and send it as a gzip file
    const data: IData = JSON.parse(backup.data as string);
    const _zip = new JSZip();

    Object.keys(data).forEach((db) => {
      //for each db, create a folder

      const _collections = Object.keys(data[db]);
      const folder = _zip.folder(db);

      _collections.forEach((collection) => {
        //for each collection in the db, create a file
        const _data = JSON.stringify(data[db][collection]);

        //add the file to the zip
        folder?.file(`${collection}.json`, _data);
      });
    });

    const zipBuffer = await _zip.generateAsync({ type: 'nodebuffer' });
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename=${fileName}.zip`,
    });

    res.send(zipBuffer);
  }
);

export { router as downloadBackupRouter };

//a function to replace every windows not allowed character with an underscore
const _clean = (str: string) => {
  return str.replace(/[<>:"/\\|?*]/g, '_').replaceAll(' ', '_');
};
