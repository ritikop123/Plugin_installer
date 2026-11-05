import React, { useEffect, useState, useContext } from 'react';
import { Field as FormikField, Form, Formik, FormikHelpers } from 'formik';
import { boolean, object, string } from 'yup';
import Field from '@/components/elements/Field';
import FormikFieldWrapper from '@/components/elements/FormikFieldWrapper';
import useFlash from '@/plugins/useFlash';
import createServerBackup from '@/api/server/backups/createServerBackup';
import FlashMessageRender from '@/components/FlashMessageRender';
import { Button } from '@/components/elements/button/index';
import tw from 'twin.macro';
import { Textarea } from '@/components/elements/Input';
import getServerBackups from '@/api/swr/getServerBackups';
import { ServerContext } from '@/state/server';
import FormikSwitch from '@/components/elements/FormikSwitch';
import Can from '@/components/elements/Can';
import { useTranslation } from 'react-i18next';

import asDialog from '@/hoc/asDialog';
import { Dialog, DialogWrapperContext } from '@/components/elements/dialog';

interface Values {
    name: string;
    ignored: string;
    isLocked: boolean;
}

const CreateBackupDialog = asDialog({
    title: 'Create Backup',
})(() => {
    const { t } = useTranslation('arix/server/backups');
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const { mutate } = getServerBackups();

    const { close } = useContext(DialogWrapperContext);

    const submit = (values: Values, { setSubmitting }: FormikHelpers<Values>) => {
        clearFlashes('backups:create');
        createServerBackup(uuid, values)
            .then((backup) => {
                mutate(
                    (data) => ({ ...data, items: data.items.concat(backup), backupCount: data.backupCount + 1 }),
                    false
                );
                close();
            })
            .catch((error) => {
                clearAndAddHttpError({ key: 'backups:create', error });
                setSubmitting(false);
            });
    };

    return (
        <Formik
            onSubmit={submit}
            initialValues={{ name: '', ignored: '', isLocked: false }}
            validationSchema={object().shape({
                name: string().max(191),
                ignored: string(),
                isLocked: boolean(),
            })}
        >
            {({ submitForm, isSubmitting }) => (
                <Form>
                    <FlashMessageRender byKey={'backups:create'} css={tw`mb-4`} />
                    <Field
                        name={'name'}
                        label={t('create.backup-name', 'Backup name')}
                        description={t('create.backup-name-description', 'A name to identify this backup by.')}
                    />
                    <div css={tw`mt-6`}>
                        <FormikFieldWrapper
                            name={'ignored'}
                            label={t('create.ignored-files-directories', 'Ignored files & directories')}
                            description={t('create.ignored-files-directories-description', 'Enter the files or folders to ignore while generating this backup.')}
                        >
                            <FormikField as={Textarea} name={'ignored'} rows={6} />
                        </FormikFieldWrapper>
                    </div>
                    <Can action={'backup.delete'}>
                        <div css={tw`mt-6 bg-neutral-700 border border-neutral-600 shadow-inner p-4 rounded-component`}>
                            <FormikSwitch
                                name={'isLocked'}
                                label={t('create.locked', 'Locked')}
                                description={t('create.locked-description', 'Prevents this backup from being deleted until explicitly unlocked.')}
                            />
                        </div>
                    </Can>
                    <Dialog.Footer>
                        <Button type={'submit'} css={tw`w-full sm:w-auto`} disabled={isSubmitting}>
                            {(!t('create.start-backup') || t('create.start-backup').startsWith('create.')) ? 'Start backup' : t('create.start-backup', 'Start backup')}
                        </Button>
                    </Dialog.Footer>
                </Form>
            )}
        </Formik>
    );
});

export default ({ css }: { css?: any }) => {
    const { t } = useTranslation('arix/server/backups');
    const { clearFlashes } = useFlash();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        clearFlashes('backups:create');
    }, [visible]);

    return (
        <>
            <CreateBackupDialog open={visible} onClose={() => setVisible(false)} />
            <Button css={css || tw`w-full sm:w-auto`} onClick={() => setVisible(true)}>
                {(!t('create.create-backup') || t('create.create-backup').startsWith('create.')) ? 'Create backup' : t('create.create-backup', 'Create backup')}
            </Button>
        </>
    );
};
