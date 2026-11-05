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
})<{ open?: boolean; onClose?: () => void }>(({ onClose }) => {
    const { t } = useTranslation('arix/server/backups');
    const tr = (key: string, fallback: string) => {
        const val = t(key, fallback);
        return !val || val === key || val.startsWith('create.') ? fallback : val;
    };
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const { mutate } = getServerBackups();

    const { close } = useContext(DialogWrapperContext);

    const handleClose = () => {
        if (typeof close === 'function') close();
        if (typeof onClose === 'function') onClose();
    };

    const submit = (values: Values, { setSubmitting }: FormikHelpers<Values>) => {
        clearFlashes('backups:create');
        createServerBackup(uuid, {
            name: values.name ? values.name.trim() : '',
            ignored: values.ignored ? values.ignored.trim() : '',
            is_locked: values.isLocked,
            isLocked: values.isLocked,
        } as any)
            .then(() => {
                try {
                    mutate();
                } catch (e) {}
                handleClose();
            })
            .catch((error) => {
                console.error('[CreateBackup]', error);
                clearAndAddHttpError({ key: 'backups:create', error });
                setSubmitting(false);
            });
    };

    return (
        <Formik
            onSubmit={submit}
            initialValues={{ name: '', ignored: '', isLocked: false }}
            validationSchema={object().shape({
                name: string().max(191).nullable(),
                ignored: string().nullable(),
                isLocked: boolean().nullable(),
            })}
        >
            {({ submitForm, isSubmitting }) => (
                <Form onSubmit={(e) => { e.preventDefault(); submitForm(); }}>
                    <FlashMessageRender byKey={'backups:create'} css={tw`mb-4`} />
                    <Field
                        name={'name'}
                        label={tr('create.backup-name', 'Backup name')}
                        description={tr('create.backup-name-description', 'A name to identify this backup by.')}
                    />
                    <div css={tw`mt-6`}>
                        <FormikFieldWrapper
                            name={'ignored'}
                            label={tr('create.ignored-files-directories', 'Ignored files & directories')}
                            description={tr('create.ignored-files-directories-description', 'Enter the files or folders to ignore while generating this backup.')}
                        >
                            <FormikField as={Textarea} name={'ignored'} rows={6} />
                        </FormikFieldWrapper>
                    </div>
                    <Can action={'backup.delete'}>
                        <div css={tw`mt-6 bg-neutral-700 border border-neutral-600 shadow-inner p-4 rounded-component`}>
                            <FormikSwitch
                                name={'isLocked'}
                                label={tr('create.locked', 'Locked')}
                                description={tr('create.locked-description', 'Prevents this backup from being deleted until explicitly unlocked.')}
                            />
                        </div>
                    </Can>
                    <Dialog.Footer>
                        <Button
                            type={'button'}
                            onClick={() => submitForm()}
                            css={tw`w-full sm:w-auto`}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Starting backup...' : tr('create.start-backup', 'Start backup')}
                        </Button>
                    </Dialog.Footer>
                </Form>
            )}
        </Formik>
    );
});

export default ({ css }: { css?: any }) => {
    const { t } = useTranslation('arix/server/backups');
    const tr = (key: string, fallback: string) => {
        const val = t(key, fallback);
        return !val || val === key || val.startsWith('create.') ? fallback : val;
    };
    const { clearFlashes } = useFlash();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        clearFlashes('backups:create');
    }, [visible]);

    return (
        <>
            <CreateBackupDialog open={visible} onClose={() => setVisible(false)} />
            <Button css={css || tw`w-full sm:w-auto`} onClick={() => setVisible(true)}>
                {tr('create.create-backup', 'Create backup')}
            </Button>
        </>
    );
};
